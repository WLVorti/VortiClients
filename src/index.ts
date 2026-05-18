import express from 'express';
import cors from 'cors';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import db, { closeDatabase } from './db/database';
import { validate, registerSchema, loginSchema } from './middleware/validation';
import { generateToken, verifyToken } from './auth/jwt';
import { authMiddleware } from './middleware/auth';
import { getChats, createChat, getChatMessages } from './handlers/rest/chats';
import { getUsers, getUserPublicKey } from './handlers/rest/users';
import { deleteMessage, editMessage, getUnreadCounters } from './handlers/rest/messages';
import { upload, uploadFile, downloadFile, getFileInfo } from './handlers/rest/files';
import { saveDraft, getDraft, deleteDraft } from './handlers/rest/drafts';
import { getProfile, updateProfile, uploadAvatarMiddleware, uploadAvatar, deleteAvatar, getUserProfile } from './handlers/rest/profile';
import { registerDevice, unregisterDevice, unregisterAllDevices, getDevices } from './handlers/rest/devices';
import { addParticipant, removeParticipant, setParticipantRole, updateGroupName, getParticipants, leaveGroup, deleteGroup, getChatInfo, transferOwnership, uploadGroupAvatar, deleteGroupAvatar, uploadGroupAvatarMiddleware } from './handlers/rest/group';
import { createCall, acceptCall, rejectCall, endCall, getCall } from './handlers/rest/calls';
import { muteChat, unmuteChat, isMuted } from './handlers/rest/mute';
import { searchMessages } from './handlers/rest/search';
import { pushService } from './services/push';
import { WebSocketClientMessage, WebSocketServerMessage, wsClientSchema } from './types';
import { clients, addClient, removeClient, getOnlineUsers } from './handlers/websocket/broadcast';
import logger from './utils/logger';
import { encrypt, decrypt } from './utils/crypto';
import { config } from './config';
import { authRateLimit, WSRateLimiter, clearRateLimits } from './middleware/rateLimit';
import https from 'https';
import http from 'http';

const app = express();
const port = config.PORT;

const isProduction = config.NODE_ENV === 'production';

const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin: isProduction 
    ? (config.CORS_ORIGIN === '*' ? undefined : config.CORS_ORIGIN.split(',').map(s => s.trim()))
    : '*'
};

app.use(cors(corsOptions));
app.use(express.json());

const clientPath = path.join(process.cwd(), 'src', 'client');
app.use('/client', express.static(clientPath));
app.get('/client', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

app.get('/favicon.ico', (req, res) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#e94560" rx="20" width="100" height="100"/><text y="70" x="50" text-anchor="middle" font-size="60" fill="white">M</text></svg>`;
  res.type('image/svg+xml').send(svg);
});

app.post('/admin/clear-rate-limits', (req, res) => {
  if (config.NODE_ENV === 'production') {
    return res.status(403).json({ status: 'error', message: 'Not available in production' });
  }
  clearRateLimits();
  res.json({ status: 'success', message: 'Rate limits cleared' });
});

app.get('/admin/health', (req, res) => {
  const totalConnections = Array.from(clients.values()).reduce((sum, set) => sum + set.size, 0);
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    clients: totalConnections,
    onlineUsers: getOnlineUsers(),
    memory: process.memoryUsage(),
    ssl: config.SSL_ENABLED,
  });
});

app.post('/register', authRateLimit, validate(registerSchema), async (req, res) => {
  const { username, password } = req.body;
  const normalizedUsername = username.toLowerCase();
  
  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(normalizedUsername);
    if (existingUser) {
      logger.warn({ username: normalizedUsername }, 'Registration attempt with existing username');
      return res.status(400).json({ status: 'error', message: 'Username already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const createdAt = Date.now();
    db.prepare('INSERT INTO users (id, username, password_hash, created_at, failed_attempts, locked_until) VALUES (?, ?, ?, ?, 0, 0)')
      .run(userId, normalizedUsername, passwordHash, createdAt);
    const token = generateToken(userId);
    logger.info({ userId, username: normalizedUsername }, 'User registered');
    res.status(201).json({ status: 'success', token, userId });
  } catch (error) {
    logger.error({ error, username: normalizedUsername }, 'Registration error');
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

app.post('/login', authRateLimit, validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = db.prepare('SELECT id, password_hash, failed_attempts, locked_until FROM users WHERE username = ?').get(username.toLowerCase()) as { id: string; password_hash: string; failed_attempts: number; locked_until: number } | undefined;
    
    if (!user) {
      logger.warn({ username }, 'Login attempt for non-existent user');
      return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
    }
    
    if (user.locked_until > Date.now()) {
      const remainingSeconds = Math.ceil((user.locked_until - Date.now()) / 1000);
      logger.warn({ username, remainingSeconds }, 'Login blocked - account locked');
      return res.status(423).json({ 
        status: 'error', 
        message: `Account locked. Try again in ${remainingSeconds} seconds.` 
      });
    }
    
    if (!(await bcrypt.compare(password, user.password_hash))) {
      const newAttempts = user.failed_attempts + 1;
      
      if (newAttempts >= 5) {
        const lockUntil = Date.now() + 15 * 60 * 1000;
        db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
          .run(newAttempts, lockUntil, user.id);
        logger.warn({ username, attempts: newAttempts }, 'Account locked due to too many failed attempts');
        return res.status(423).json({ 
          status: 'error', 
          message: 'Too many failed attempts. Account locked for 15 minutes.' 
        });
      }
      
      db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?')
        .run(newAttempts, user.id);
      logger.warn({ username, attempts: newAttempts }, 'Failed login attempt');
      return res.status(401).json({ 
        status: 'error', 
        message: `Invalid username or password. ${5 - newAttempts} attempts remaining.` 
      });
    }
    
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = ?')
      .run(user.id);
    
    const token = generateToken(user.id);
    logger.info({ userId: user.id, username }, 'User logged in');
    res.json({ status: 'success', token, userId: user.id });
  } catch (error) {
    logger.error({ error, username }, 'Login error');
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

app.get('/chats', authMiddleware, getChats);
app.get('/chats/unread', authMiddleware, getUnreadCounters);
app.post('/chats', authMiddleware, createChat);
app.get('/chats/:id/messages', authMiddleware, getChatMessages);
app.post('/chats/:chatId/mute', authMiddleware, muteChat);
app.delete('/chats/:chatId/mute', authMiddleware, unmuteChat);

// Group management
app.get('/chats/:chatId', authMiddleware, getChatInfo);
app.get('/chats/:chatId/participants', authMiddleware, getParticipants);
app.post('/chats/:chatId/participants', authMiddleware, addParticipant);
app.delete('/chats/:chatId/participants/:userId', authMiddleware, removeParticipant);
app.put('/chats/:chatId/participants/:userId/role', authMiddleware, setParticipantRole);
app.put('/chats/:chatId/name', authMiddleware, updateGroupName);
app.put('/chats/:chatId/transfer', authMiddleware, transferOwnership);
app.delete('/chats/:chatId/leave', authMiddleware, leaveGroup);
app.delete('/chats/:chatId', authMiddleware, deleteGroup);
app.post('/chats/:chatId/avatar', authMiddleware, uploadGroupAvatarMiddleware, uploadGroupAvatar);
app.delete('/chats/:chatId/avatar', authMiddleware, deleteGroupAvatar);

// Calls
app.post('/chats/:chatId/call', authMiddleware, createCall);
app.get('/calls/:callId', authMiddleware, getCall);
app.post('/calls/:callId/accept', authMiddleware, acceptCall);
app.post('/calls/:callId/reject', authMiddleware, rejectCall);
app.delete('/calls/:callId', authMiddleware, endCall);

app.put('/messages/:id', authMiddleware, editMessage);
app.delete('/messages/:id', authMiddleware, deleteMessage);

app.get('/search/messages', authMiddleware, searchMessages);
app.get('/users', authMiddleware, getUsers);
app.get('/users/:userId/public-key', authMiddleware, getUserPublicKey);

app.get('/', (req, res) => res.json({ message: 'Mainprj server is running!' }));

app.get('/health', (req, res) => {
  const startTime = Date.now();
  try {
    db.prepare('SELECT 1').get();
    const responseTime = Date.now() - startTime;
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
      db: 'connected',
      wsConnections: clients.size,
      ssl: config.SSL_ENABLED,
      responseTime
    });
  } catch {
    res.status(503).json({
      status: 'error',
      timestamp: Date.now(),
      db: 'disconnected'
    });
  }
});

app.post('/upload', authMiddleware, upload.single('file'), uploadFile);
app.get('/files/:fileId', authMiddleware, getFileInfo);
app.get('/download/:fileId', (req, res, next) => {
  const token = req.query.token as string;
  if (token) req.headers.authorization = `Bearer ${token}`;
  authMiddleware(req, res, next);
}, downloadFile);

app.post('/drafts', authMiddleware, saveDraft);
app.get('/drafts/:chatId', authMiddleware, getDraft);
app.delete('/drafts/:chatId', authMiddleware, deleteDraft);

app.get('/profile', authMiddleware, getProfile);
app.put('/profile', authMiddleware, updateProfile);
app.post('/profile/avatar', authMiddleware, uploadAvatarMiddleware, uploadAvatar);
app.delete('/profile/avatar', authMiddleware, deleteAvatar);
app.get('/users/:userId/profile', authMiddleware, getUserProfile);

app.post('/devices', authMiddleware, registerDevice);
app.get('/devices', authMiddleware, getDevices);
app.delete('/devices/:tokenId', authMiddleware, unregisterDevice);
app.delete('/devices', authMiddleware, unregisterAllDevices);

app.use('/uploads/avatars', express.static(path.join(process.cwd(), 'uploads/avatars')));
app.use('/uploads/group-avatars', express.static(path.join(process.cwd(), 'uploads/group-avatars')));

const MAX_CONNECTIONS = 1000;
const MAX_BATCH_SIZE = 100;

let server: http.Server | https.Server;

if (config.SSL_ENABLED && config.SSL_CONFIG) {
  server = https.createServer(config.SSL_CONFIG, app);
  logger.info('HTTPS server configured');
} else {
  server = http.createServer(app);
  if (config.SSL_ENABLED) {
    logger.warn('SSL_ENABLED=true but SSL_CERT_PATH or SSL_KEY_PATH not set. Using HTTP.');
  }
}

const wss = new WebSocketServer({ server });

const typingTimeouts = new Map<string, NodeJS.Timeout>();

server.listen(port, () => {
  const protocol = config.SSL_ENABLED ? 'https' : 'http';
  logger.info(`Server is running at ${protocol}://localhost:${port} in ${config.NODE_ENV} mode`);
});

wss.on('connection', (ws: WebSocket, req) => {
  const totalConnections = Array.from(clients.values()).reduce((sum, set) => sum + set.size, 0);
  if (totalConnections >= MAX_CONNECTIONS) {
    logger.warn('Max connections reached, rejecting new connection');
    ws.close(1013, 'Server at capacity');
    return;
  }
  let authenticatedUserId: string | null = null;
  const ip = req.socket.remoteAddress || 'unknown';
  const limiter = new WSRateLimiter();

  logger.debug({ ip }, 'New incoming WS connection');

  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);

  ws.on('message', async (data: string) => {
    if (!limiter.checkLimit()) {
      logger.warn({ userId: authenticatedUserId, ip }, 'WS rate limit exceeded');
      ws.send(JSON.stringify({ type: 'error', message: 'Too many messages' }));
      return;
    }

    try {
      const rawMessage = JSON.parse(data.toString());
      const parseResult = wsClientSchema.safeParse(rawMessage);
      
      if (!parseResult.success) {
        logger.warn({ error: parseResult.error.issues, userId: authenticatedUserId }, 'Invalid WS message format');
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        return;
      }
      
      const message = parseResult.data as WebSocketClientMessage;

      if (message.type === 'auth') {
        const decoded = verifyToken(message.token);
        if (decoded) {
          authenticatedUserId = decoded.userId;
          addClient(authenticatedUserId, ws);
          const response: WebSocketServerMessage = { type: 'connected', userId: authenticatedUserId };
          ws.send(JSON.stringify(response));
          
          const onlineUsersList = getOnlineUsers();
          const onlineUsersResponse: WebSocketServerMessage = { type: 'online_users', users: onlineUsersList };
          ws.send(JSON.stringify(onlineUsersResponse));
          
          logger.info({ userId: authenticatedUserId }, 'User authenticated via WS');
        } else {
          logger.warn({ ip }, 'WS auth failed: invalid token');
          ws.close(1008, 'Invalid token');
        }
        return;
      }

      if (!authenticatedUserId) {
        ws.close(1008, 'Not authenticated');
        return;
      }

      if (message.type === 'send') {
        const { chatId, text, replyTo, tempId } = message;
        
        const chatExists = db.prepare('SELECT 1 FROM chats WHERE id = ?').get(chatId);
        if (!chatExists) {
          ws.send(JSON.stringify({ type: 'error', message: 'Chat not found', tempId }));
          return;
        }
        
        const isParticipant = db.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, authenticatedUserId);
        if (!isParticipant) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not a participant of this chat', tempId }));
          return;
        }
        
        const messageId = uuidv4();
        const timestamp = Date.now();
        const encryptedText = encrypt(text);

        db.prepare('INSERT INTO messages (id, chat_id, user_id, text, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(messageId, chatId, authenticatedUserId, encryptedText, replyTo || null, timestamp);

        const participants = db.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chatId) as { user_id: string }[];

        let replyInfo: { replyId: string; replyText: string; replyUser: string } | undefined;
        if (replyTo) {
          const replyMsg = db.prepare('SELECT m.id, m.text, u.username FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?').get(replyTo) as { id: string; text: string; username: string } | undefined;
          if (replyMsg) {
            replyInfo = {
              replyId: replyMsg.id,
              replyText: decrypt(replyMsg.text).substring(0, 100),
              replyUser: replyMsg.username
            };
          }
        }

        const serverMessage: WebSocketServerMessage = {
          type: 'message',
          id: messageId,
          chatId,
          userId: authenticatedUserId,
          text: text,
          timestamp,
          ...(replyInfo && { reply: replyInfo }),
          ...(tempId && { tempId })
        };

        const msgJson = JSON.stringify(serverMessage);

        logger.info({ chatId, participants: participants.map(p => p.user_id), clientsCount: Array.from(clients.values()).reduce((s, set) => s + set.size, 0) }, 'Broadcasting message');

        // Получаем имя чата и отправителя для пушей
        let chatName = chatId;
        let senderUsername = '';
        let senderAvatarUrl = '';
        let chatType = 'direct';
        try {
          const chatInfo = db.prepare('SELECT name, type FROM chats WHERE id = ?').get(chatId) as { name: string | null; type: string } | undefined;
          if (chatInfo) {
            chatType = chatInfo.type;
            if (chatInfo.type === 'direct') {
              const otherUser = db.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(authenticatedUserId) as { username: string; avatar_url: string | null } | undefined;
              senderUsername = otherUser?.username || '';
              senderAvatarUrl = otherUser?.avatar_url || '';
            } else {
              chatName = chatInfo.name || chatId;
              const sender = db.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(authenticatedUserId) as { username: string; avatar_url: string | null } | undefined;
              senderUsername = sender?.username || '';
              senderAvatarUrl = sender?.avatar_url || '';
            }
          }
        } catch { /* ignore */ }

        const batchSize = participants.length > MAX_BATCH_SIZE ? Math.ceil(participants.length / 10) : participants.length;
        for (let i = 0; i < participants.length; i += batchSize) {
          const batch = participants.slice(i, i + batchSize);
          for (const p of batch) {
            const userClients = clients.get(p.user_id);
            if (userClients) {
              for (const clientWs of userClients) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(msgJson);
                  
                  // Записываем доставку если получатель онлайн (не отправитель)
                  if (p.user_id !== authenticatedUserId) {
                    try {
                      db.prepare('INSERT OR IGNORE INTO delivery_receipts (message_id, user_id, delivered_at) VALUES (?, ?, ?)')
                        .run(messageId, p.user_id, Date.now());
                      
                      // Отправляем событие delivered отправителю
                      const senderClients = clients.get(authenticatedUserId);
                      if (senderClients) {
                        const deliveredMsg: WebSocketServerMessage = {
                          type: 'delivered',
                          messageId,
                          userId: p.user_id
                        };
                        for (const senderWs of senderClients) {
                          if (senderWs.readyState === WebSocket.OPEN) {
                            senderWs.send(JSON.stringify(deliveredMsg));
                          }
                        }
                      }
                    } catch { /* ignore */ }
                  }
                }
              }
            }
          }
          if (i + batchSize < participants.length) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }

        // Отправляем push-уведомления оффлайн пользователям
        for (const p of participants) {
          if (p.user_id === authenticatedUserId) continue;
          
          const userClients = clients.get(p.user_id);
          const isOffline = !userClients || userClients.size === 0;
          
          if (isOffline && !isMuted(p.user_id, chatId)) {
            logger.info({ 
              userId: p.user_id, 
              clientCount: userClients?.size || 0, 
              isOffline 
            }, 'Sending push notification');
            
            const messagePreview = text.length > 100 ? text.substring(0, 100) + '...' : text;
            
            pushService.sendToUser(p.user_id, {
              title: chatType === 'direct' ? senderUsername : chatName,
              body: messagePreview,
              data: {
                type: 'message',
                chatId,
                messageId,
              },
              avatarUrl: senderAvatarUrl,
            }).catch(err => logger.error({ error: err, userId: p.user_id }, 'Push notification failed'));
          }
        }
      }

      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }

      if (message.type === 'typing') {
        const { chatId, isTyping } = message;
        const typingKey = `${authenticatedUserId}_${chatId}`;

        if (typingTimeouts.has(typingKey)) {
          clearTimeout(typingTimeouts.get(typingKey));
          typingTimeouts.delete(typingKey);
        }

        const participants = db.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chatId) as { user_id: string }[];
        
        const typingMessage: WebSocketServerMessage = {
          type: 'typing',
          chatId,
          userId: authenticatedUserId,
          isTyping
        };
        const msgJson = JSON.stringify(typingMessage);

        for (const p of participants) {
          if (p.user_id !== authenticatedUserId) {
            const userClients = clients.get(p.user_id);
            if (userClients) {
              for (const clientWs of userClients) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(msgJson);
                }
              }
            }
          }
        }
        logger.debug({ chatId, participants: participants.map(p => p.user_id), isTyping }, 'Typing indicator broadcast');

        if (isTyping) {
          const timeout = setTimeout(() => {
            typingTimeouts.delete(typingKey);
            const stopTypingMessage: WebSocketServerMessage = {
              type: 'typing',
              chatId,
              userId: authenticatedUserId!,
              isTyping: false
            };
            const stopJson = JSON.stringify(stopTypingMessage);
            for (const p of participants) {
              if (p.user_id !== authenticatedUserId) {
                const userClients = clients.get(p.user_id);
                if (userClients) {
                  for (const clientWs of userClients) {
                    if (clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(stopJson);
                    }
                  }
                }
              }
            }
          }, 3000);
          typingTimeouts.set(typingKey, timeout);
        }
      }

      if (message.type === 'call_signal') {
        const { callId, signalType, sdp, candidate } = message;
        
        const call = db.prepare('SELECT chat_id FROM calls WHERE id = ?').get(callId) as { chat_id: string } | undefined;
        if (!call) {
          ws.send(JSON.stringify({ type: 'error', message: 'Call not found' }));
          return;
        }

        const participants = db.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(call.chat_id) as { user_id: string }[];
        
        const signal: WebSocketServerMessage = {
          type: 'call_signal',
          callId,
          signalType,
          ...(sdp && { sdp }),
          ...(candidate && { candidate }),
        };
        const msgJson = JSON.stringify(signal);

        for (const p of participants) {
          if (p.user_id !== authenticatedUserId) {
            const userClients = clients.get(p.user_id);
            if (userClients) {
              for (const clientWs of userClients) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(msgJson);
                }
              }
            }
          }
        }
        logger.debug({ callId, signalType }, 'Call signal relayed');
      }

      if (message.type === 'read') {
        const { messageId } = message;
        const readAt = Date.now();

        try {
          const msgInfo = db.prepare('SELECT chat_id, user_id FROM messages WHERE id = ?').get(messageId) as { chat_id: string; user_id: string } | undefined;
          
          if (!msgInfo) {
            ws.send(JSON.stringify({ type: 'error', message: 'Message not found' }));
            return;
          }
          
          const isParticipant = db.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(msgInfo.chat_id, authenticatedUserId);
          if (!isParticipant) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not a participant of this chat' }));
            return;
          }

          // Сначала проверим delivered, если нет - запишем
          const alreadyDelivered = db.prepare('SELECT 1 FROM delivery_receipts WHERE message_id = ? AND user_id = ?').get(messageId, authenticatedUserId);
          if (!alreadyDelivered) {
            db.prepare('INSERT OR IGNORE INTO delivery_receipts (message_id, user_id, delivered_at) VALUES (?, ?, ?)')
              .run(messageId, authenticatedUserId, Date.now());
            
            // Отправляем delivered отправителю
            const senderClients = clients.get(msgInfo.user_id);
            if (senderClients) {
              const deliveredMsg: WebSocketServerMessage = {
                type: 'delivered',
                messageId,
                userId: authenticatedUserId
              };
              for (const senderWs of senderClients) {
                if (senderWs.readyState === WebSocket.OPEN) {
                  senderWs.send(JSON.stringify(deliveredMsg));
                }
              }
            }
          }

          db.prepare('INSERT OR IGNORE INTO read_receipts (message_id, user_id, read_at) VALUES (?, ?, ?)')
            .run(messageId, authenticatedUserId, readAt);

          const participants = db.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(msgInfo.chat_id) as { user_id: string }[];
          const readNotification: WebSocketServerMessage = {
            type: 'read',
            messageId,
            userId: authenticatedUserId
          };
          const readJson = JSON.stringify(readNotification);

          for (const p of participants) {
            if (p.user_id !== authenticatedUserId) {
              const userClients = clients.get(p.user_id);
              if (userClients) {
                for (const clientWs of userClients) {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(readJson);
                  }
                }
              }
            }
          }
        } catch (error) {
          logger.error({ error, messageId, userId: authenticatedUserId }, 'Failed to process read receipt');
        }
      }

      if (message.type === 'sync') {
        // Client fetches messages via REST API when entering chat
      }

      if (message.type === 'sendFile') {
        const { chatId, fileId, replyTo, fileMimeType, tempId } = message as any;
        
        const chatExists = db.prepare('SELECT 1 FROM chats WHERE id = ?').get(chatId);
        if (!chatExists) {
          ws.send(JSON.stringify({ type: 'error', message: 'Chat not found', tempId }));
          return;
        }
        
        const isParticipant = db.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, authenticatedUserId);
        if (!isParticipant) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not a participant of this chat', tempId }));
          return;
        }
        
        const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
        if (!file) {
          ws.send(JSON.stringify({ type: 'error', message: 'File not found', tempId }));
          return;
        }
        
        const messageId = uuidv4();
        const timestamp = Date.now();
        const encryptedText = encrypt(`[File] ${file.original_name}`);

        db.prepare('INSERT INTO messages (id, chat_id, user_id, text, reply_to, file_id, file_mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(messageId, chatId, authenticatedUserId, encryptedText, replyTo || null, fileId, fileMimeType || null, timestamp);

        const participants = db.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chatId) as { user_id: string }[];

        const serverMessage: WebSocketServerMessage = {
          type: 'message',
          id: messageId,
          chatId,
          userId: authenticatedUserId,
          text: `[File] ${file.original_name}`,
          fileId,
          file_mime_type: fileMimeType || null,
          timestamp,
          ...(tempId && { tempId })
        };

        const msgJson = JSON.stringify(serverMessage);

        logger.info({ chatId, fileId, messageId }, 'File message sent');

        for (const p of participants) {
          const userClients = clients.get(p.user_id);
          if (userClients) {
            for (const clientWs of userClients) {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(msgJson);
              }
            }
          }
        }
      }

      if (message.type === 'keyExchange') {
        const { publicKey } = message;
        
        db.prepare(`
          INSERT INTO encryption_keys (user_id, public_key, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET public_key = ?, updated_at = ?
        `).run(authenticatedUserId, publicKey, Date.now(), Date.now(), publicKey, Date.now());
        
        logger.info({ userId: authenticatedUserId }, 'Public key updated');
        ws.send(JSON.stringify({ type: 'keyReceived', userId: authenticatedUserId }));
      }

      if (message.type === 'requestKey') {
        const { userId } = message;
        
        const keyRecord = db.prepare('SELECT public_key FROM encryption_keys WHERE user_id = ?').get(userId) as { public_key: string } | undefined;
        
        if (keyRecord) {
          ws.send(JSON.stringify({
            type: 'publicKey',
            userId,
            publicKey: keyRecord.public_key
          }));
        }
      }

    } catch (error) {
      logger.error({ error, userId: authenticatedUserId }, 'WS Message processing error');
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    if (authenticatedUserId) {
      removeClient(authenticatedUserId, ws);
      
      if (!clients.has(authenticatedUserId)) {
        const userChats = db.prepare('SELECT chat_id FROM participants WHERE user_id = ?').all(authenticatedUserId) as { chat_id: string }[];
        const offlineMsg: WebSocketServerMessage = { type: 'online', userId: authenticatedUserId, status: 'offline' };
        const offlineJson = JSON.stringify(offlineMsg);
        for (const chat of userChats) {
          const participants = db.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chat.chat_id) as { user_id: string }[];
          for (const p of participants) {
            if (p.user_id !== authenticatedUserId) {
              const userClients = clients.get(p.user_id);
              if (userClients) {
                for (const clientWs of userClients) {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(offlineJson);
                  }
                }
              }
            }
          }
        }
      }
      logger.info({ userId: authenticatedUserId }, 'User disconnected from WS');
    }
  });
});

let isShuttingDown = false;

const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Graceful shutdown initiated. Waiting up to 10 seconds...');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000);

  const totalConnections = Array.from(clients.values()).reduce((sum, set) => sum + set.size, 0);
  logger.info(`Closing ${totalConnections} active WS connections...`);
  for (const wsSet of clients.values()) {
    for (const ws of wsSet) {
      ws.close(1001, 'Server is shutting down');
    }
  }
  wss.close();

  server.close(() => {
    logger.info('HTTP server closed.');
    closeDatabase();
    logger.info('Database connection closed.');
    clearTimeout(forceExit);
    logger.info('Graceful shutdown complete.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('exit', () => {
  logger.info('Process exiting');
});

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${port} is already in use. Try: taskkill /F /IM node.exe`);
    process.exit(1);
  }
  throw err;
});
