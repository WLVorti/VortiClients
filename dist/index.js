"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const uuid_1 = require("uuid");
const bcrypt_1 = __importDefault(require("bcrypt"));
const database_1 = __importStar(require("./db/database"));
const validation_1 = require("./middleware/validation");
const jwt_1 = require("./auth/jwt");
const auth_1 = require("./middleware/auth");
const chats_1 = require("./handlers/rest/chats");
const users_1 = require("./handlers/rest/users");
const messages_1 = require("./handlers/rest/messages");
const files_1 = require("./handlers/rest/files");
const drafts_1 = require("./handlers/rest/drafts");
const profile_1 = require("./handlers/rest/profile");
const devices_1 = require("./handlers/rest/devices");
const group_1 = require("./handlers/rest/group");
const calls_1 = require("./handlers/rest/calls");
const mute_1 = require("./handlers/rest/mute");
const push_1 = require("./services/push");
const types_1 = require("./types");
const broadcast_1 = require("./handlers/websocket/broadcast");
const logger_1 = __importDefault(require("./utils/logger"));
const crypto_1 = require("./utils/crypto");
const config_1 = require("./config");
const rateLimit_1 = require("./middleware/rateLimit");
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const app = (0, express_1.default)();
const port = config_1.config.PORT;
const isProduction = config_1.config.NODE_ENV === 'production';
const corsOptions = {
    credentials: true,
    origin: isProduction
        ? (config_1.config.CORS_ORIGIN === '*' ? undefined : config_1.config.CORS_ORIGIN.split(',').map(s => s.trim()))
        : '*'
};
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
const clientPath = path_1.default.join(process.cwd(), 'src', 'client');
app.use('/client', express_1.default.static(clientPath));
app.get('/client', (req, res) => {
    res.sendFile(path_1.default.join(clientPath, 'index.html'));
});
app.get('/favicon.ico', (req, res) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#e94560" rx="20" width="100" height="100"/><text y="70" x="50" text-anchor="middle" font-size="60" fill="white">M</text></svg>`;
    res.type('image/svg+xml').send(svg);
});
app.post('/admin/clear-rate-limits', (req, res) => {
    if (config_1.config.NODE_ENV === 'production') {
        return res.status(403).json({ status: 'error', message: 'Not available in production' });
    }
    (0, rateLimit_1.clearRateLimits)();
    res.json({ status: 'success', message: 'Rate limits cleared' });
});
app.get('/admin/health', (req, res) => {
    const totalConnections = Array.from(broadcast_1.clients.values()).reduce((sum, set) => sum + set.size, 0);
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        clients: totalConnections,
        onlineUsers: (0, broadcast_1.getOnlineUsers)(),
        memory: process.memoryUsage(),
        ssl: config_1.config.SSL_ENABLED,
    });
});
app.post('/register', rateLimit_1.authRateLimit, (0, validation_1.validate)(validation_1.registerSchema), async (req, res) => {
    const { username, password } = req.body;
    const normalizedUsername = username.toLowerCase();
    try {
        const existingUser = database_1.default.prepare('SELECT id FROM users WHERE username = ?').get(normalizedUsername);
        if (existingUser) {
            logger_1.default.warn({ username: normalizedUsername }, 'Registration attempt with existing username');
            return res.status(400).json({ status: 'error', message: 'Username already exists' });
        }
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        const userId = (0, uuid_1.v4)();
        const createdAt = Date.now();
        database_1.default.prepare('INSERT INTO users (id, username, password_hash, created_at, failed_attempts, locked_until) VALUES (?, ?, ?, ?, 0, 0)')
            .run(userId, normalizedUsername, passwordHash, createdAt);
        const token = (0, jwt_1.generateToken)(userId);
        logger_1.default.info({ userId, username: normalizedUsername }, 'User registered');
        res.status(201).json({ status: 'success', token, userId });
    }
    catch (error) {
        logger_1.default.error({ error, username: normalizedUsername }, 'Registration error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});
app.post('/login', rateLimit_1.authRateLimit, (0, validation_1.validate)(validation_1.loginSchema), async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = database_1.default.prepare('SELECT id, password_hash, failed_attempts, locked_until FROM users WHERE username = ?').get(username.toLowerCase());
        if (!user) {
            logger_1.default.warn({ username }, 'Login attempt for non-existent user');
            return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
        }
        if (user.locked_until > Date.now()) {
            const remainingSeconds = Math.ceil((user.locked_until - Date.now()) / 1000);
            logger_1.default.warn({ username, remainingSeconds }, 'Login blocked - account locked');
            return res.status(423).json({
                status: 'error',
                message: `Account locked. Try again in ${remainingSeconds} seconds.`
            });
        }
        if (!(await bcrypt_1.default.compare(password, user.password_hash))) {
            const newAttempts = user.failed_attempts + 1;
            if (newAttempts >= 5) {
                const lockUntil = Date.now() + 15 * 60 * 1000;
                database_1.default.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
                    .run(newAttempts, lockUntil, user.id);
                logger_1.default.warn({ username, attempts: newAttempts }, 'Account locked due to too many failed attempts');
                return res.status(423).json({
                    status: 'error',
                    message: 'Too many failed attempts. Account locked for 15 minutes.'
                });
            }
            database_1.default.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?')
                .run(newAttempts, user.id);
            logger_1.default.warn({ username, attempts: newAttempts }, 'Failed login attempt');
            return res.status(401).json({
                status: 'error',
                message: `Invalid username or password. ${5 - newAttempts} attempts remaining.`
            });
        }
        database_1.default.prepare('UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = ?')
            .run(user.id);
        const token = (0, jwt_1.generateToken)(user.id);
        logger_1.default.info({ userId: user.id, username }, 'User logged in');
        res.json({ status: 'success', token, userId: user.id });
    }
    catch (error) {
        logger_1.default.error({ error, username }, 'Login error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});
app.get('/chats', auth_1.authMiddleware, chats_1.getChats);
app.get('/chats/unread', auth_1.authMiddleware, messages_1.getUnreadCounters);
app.post('/chats', auth_1.authMiddleware, chats_1.createChat);
app.get('/chats/:id/messages', auth_1.authMiddleware, chats_1.getChatMessages);
app.post('/chats/:chatId/mute', auth_1.authMiddleware, mute_1.muteChat);
app.delete('/chats/:chatId/mute', auth_1.authMiddleware, mute_1.unmuteChat);
// Group management
app.get('/chats/:chatId', auth_1.authMiddleware, group_1.getChatInfo);
app.get('/chats/:chatId/participants', auth_1.authMiddleware, group_1.getParticipants);
app.post('/chats/:chatId/participants', auth_1.authMiddleware, group_1.addParticipant);
app.delete('/chats/:chatId/participants/:userId', auth_1.authMiddleware, group_1.removeParticipant);
app.put('/chats/:chatId/participants/:userId/role', auth_1.authMiddleware, group_1.setParticipantRole);
app.put('/chats/:chatId/name', auth_1.authMiddleware, group_1.updateGroupName);
app.put('/chats/:chatId/transfer', auth_1.authMiddleware, group_1.transferOwnership);
app.delete('/chats/:chatId/leave', auth_1.authMiddleware, group_1.leaveGroup);
app.delete('/chats/:chatId', auth_1.authMiddleware, group_1.deleteGroup);
app.post('/chats/:chatId/avatar', auth_1.authMiddleware, group_1.uploadGroupAvatarMiddleware, group_1.uploadGroupAvatar);
app.delete('/chats/:chatId/avatar', auth_1.authMiddleware, group_1.deleteGroupAvatar);
// Calls
app.post('/chats/:chatId/call', auth_1.authMiddleware, calls_1.createCall);
app.get('/calls/:callId', auth_1.authMiddleware, calls_1.getCall);
app.post('/calls/:callId/accept', auth_1.authMiddleware, calls_1.acceptCall);
app.post('/calls/:callId/reject', auth_1.authMiddleware, calls_1.rejectCall);
app.delete('/calls/:callId', auth_1.authMiddleware, calls_1.endCall);
app.put('/messages/:id', auth_1.authMiddleware, messages_1.editMessage);
app.delete('/messages/:id', auth_1.authMiddleware, messages_1.deleteMessage);
app.get('/users', auth_1.authMiddleware, users_1.getUsers);
app.get('/users/:userId/public-key', auth_1.authMiddleware, users_1.getUserPublicKey);
app.get('/', (req, res) => res.json({ message: 'Mainprj server is running!' }));
app.get('/health', (req, res) => {
    const startTime = Date.now();
    try {
        database_1.default.prepare('SELECT 1').get();
        const responseTime = Date.now() - startTime;
        res.json({
            status: 'ok',
            timestamp: Date.now(),
            uptime: process.uptime(),
            db: 'connected',
            wsConnections: broadcast_1.clients.size,
            ssl: config_1.config.SSL_ENABLED,
            responseTime
        });
    }
    catch {
        res.status(503).json({
            status: 'error',
            timestamp: Date.now(),
            db: 'disconnected'
        });
    }
});
app.post('/upload', auth_1.authMiddleware, files_1.upload.single('file'), files_1.uploadFile);
app.get('/files/:fileId', auth_1.authMiddleware, files_1.getFileInfo);
app.get('/download/:fileId', (req, res, next) => {
    const token = req.query.token;
    if (token)
        req.headers.authorization = `Bearer ${token}`;
    (0, auth_1.authMiddleware)(req, res, next);
}, files_1.downloadFile);
app.post('/drafts', auth_1.authMiddleware, drafts_1.saveDraft);
app.get('/drafts/:chatId', auth_1.authMiddleware, drafts_1.getDraft);
app.delete('/drafts/:chatId', auth_1.authMiddleware, drafts_1.deleteDraft);
app.get('/profile', auth_1.authMiddleware, profile_1.getProfile);
app.put('/profile', auth_1.authMiddleware, profile_1.updateProfile);
app.post('/profile/avatar', auth_1.authMiddleware, profile_1.uploadAvatarMiddleware, profile_1.uploadAvatar);
app.delete('/profile/avatar', auth_1.authMiddleware, profile_1.deleteAvatar);
app.get('/users/:userId/profile', auth_1.authMiddleware, profile_1.getUserProfile);
app.post('/devices', auth_1.authMiddleware, devices_1.registerDevice);
app.get('/devices', auth_1.authMiddleware, devices_1.getDevices);
app.delete('/devices/:tokenId', auth_1.authMiddleware, devices_1.unregisterDevice);
app.delete('/devices', auth_1.authMiddleware, devices_1.unregisterAllDevices);
app.use('/uploads/avatars', express_1.default.static(path_1.default.join(process.cwd(), 'uploads/avatars')));
app.use('/uploads/group-avatars', express_1.default.static(path_1.default.join(process.cwd(), 'uploads/group-avatars')));
const MAX_CONNECTIONS = 1000;
const MAX_BATCH_SIZE = 100;
let server;
if (config_1.config.SSL_ENABLED && config_1.config.SSL_CONFIG) {
    server = https_1.default.createServer(config_1.config.SSL_CONFIG, app);
    logger_1.default.info('HTTPS server configured');
}
else {
    server = http_1.default.createServer(app);
    if (config_1.config.SSL_ENABLED) {
        logger_1.default.warn('SSL_ENABLED=true but SSL_CERT_PATH or SSL_KEY_PATH not set. Using HTTP.');
    }
}
const wss = new ws_1.WebSocketServer({ server });
const typingTimeouts = new Map();
server.listen(port, () => {
    const protocol = config_1.config.SSL_ENABLED ? 'https' : 'http';
    logger_1.default.info(`Server is running at ${protocol}://localhost:${port} in ${config_1.config.NODE_ENV} mode`);
});
wss.on('connection', (ws, req) => {
    const totalConnections = Array.from(broadcast_1.clients.values()).reduce((sum, set) => sum + set.size, 0);
    if (totalConnections >= MAX_CONNECTIONS) {
        logger_1.default.warn('Max connections reached, rejecting new connection');
        ws.close(1013, 'Server at capacity');
        return;
    }
    let authenticatedUserId = null;
    const ip = req.socket.remoteAddress || 'unknown';
    const limiter = new rateLimit_1.WSRateLimiter();
    logger_1.default.debug({ ip }, 'New incoming WS connection');
    const pingInterval = setInterval(() => {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);
    ws.on('message', async (data) => {
        if (!limiter.checkLimit()) {
            logger_1.default.warn({ userId: authenticatedUserId, ip }, 'WS rate limit exceeded');
            ws.send(JSON.stringify({ type: 'error', message: 'Too many messages' }));
            return;
        }
        try {
            const rawMessage = JSON.parse(data.toString());
            const parseResult = types_1.wsClientSchema.safeParse(rawMessage);
            if (!parseResult.success) {
                logger_1.default.warn({ error: parseResult.error.issues, userId: authenticatedUserId }, 'Invalid WS message format');
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
                return;
            }
            const message = parseResult.data;
            if (message.type === 'auth') {
                const decoded = (0, jwt_1.verifyToken)(message.token);
                if (decoded) {
                    authenticatedUserId = decoded.userId;
                    (0, broadcast_1.addClient)(authenticatedUserId, ws);
                    const response = { type: 'connected', userId: authenticatedUserId };
                    ws.send(JSON.stringify(response));
                    const onlineUsersList = (0, broadcast_1.getOnlineUsers)();
                    const onlineUsersResponse = { type: 'online_users', users: onlineUsersList };
                    ws.send(JSON.stringify(onlineUsersResponse));
                    logger_1.default.info({ userId: authenticatedUserId }, 'User authenticated via WS');
                }
                else {
                    logger_1.default.warn({ ip }, 'WS auth failed: invalid token');
                    ws.close(1008, 'Invalid token');
                }
                return;
            }
            if (!authenticatedUserId) {
                ws.close(1008, 'Not authenticated');
                return;
            }
            if (message.type === 'send') {
                const { chatId, text, replyTo } = message;
                const chatExists = database_1.default.prepare('SELECT 1 FROM chats WHERE id = ?').get(chatId);
                if (!chatExists) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Chat not found' }));
                    return;
                }
                const isParticipant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, authenticatedUserId);
                if (!isParticipant) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Not a participant of this chat' }));
                    return;
                }
                const messageId = (0, uuid_1.v4)();
                const timestamp = Date.now();
                const encryptedText = (0, crypto_1.encrypt)(text);
                database_1.default.prepare('INSERT INTO messages (id, chat_id, user_id, text, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(messageId, chatId, authenticatedUserId, encryptedText, replyTo || null, timestamp);
                const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chatId);
                let replyInfo;
                if (replyTo) {
                    const replyMsg = database_1.default.prepare('SELECT m.id, m.text, u.username FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?').get(replyTo);
                    if (replyMsg) {
                        replyInfo = {
                            replyId: replyMsg.id,
                            replyText: (0, crypto_1.decrypt)(replyMsg.text).substring(0, 100),
                            replyUser: replyMsg.username
                        };
                    }
                }
                const serverMessage = {
                    type: 'message',
                    id: messageId,
                    chatId,
                    userId: authenticatedUserId,
                    text: text,
                    timestamp,
                    ...(replyInfo && { reply: replyInfo })
                };
                const msgJson = JSON.stringify(serverMessage);
                logger_1.default.info({ chatId, participants: participants.map(p => p.user_id), clientsCount: Array.from(broadcast_1.clients.values()).reduce((s, set) => s + set.size, 0) }, 'Broadcasting message');
                // Получаем имя чата и отправителя для пушей
                let chatName = chatId;
                let senderUsername = '';
                let senderAvatarUrl = '';
                let chatType = 'direct';
                try {
                    const chatInfo = database_1.default.prepare('SELECT name, type FROM chats WHERE id = ?').get(chatId);
                    if (chatInfo) {
                        chatType = chatInfo.type;
                        if (chatInfo.type === 'direct') {
                            const otherUser = database_1.default.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(authenticatedUserId);
                            senderUsername = otherUser?.username || '';
                            senderAvatarUrl = otherUser?.avatar_url || '';
                        }
                        else {
                            chatName = chatInfo.name || chatId;
                            const sender = database_1.default.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(authenticatedUserId);
                            senderUsername = sender?.username || '';
                            senderAvatarUrl = sender?.avatar_url || '';
                        }
                    }
                }
                catch { /* ignore */ }
                const batchSize = participants.length > MAX_BATCH_SIZE ? Math.ceil(participants.length / 10) : participants.length;
                for (let i = 0; i < participants.length; i += batchSize) {
                    const batch = participants.slice(i, i + batchSize);
                    for (const p of batch) {
                        const userClients = broadcast_1.clients.get(p.user_id);
                        if (userClients) {
                            for (const clientWs of userClients) {
                                if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                                    clientWs.send(msgJson);
                                    // Записываем доставку если получатель онлайн (не отправитель)
                                    if (p.user_id !== authenticatedUserId) {
                                        try {
                                            database_1.default.prepare('INSERT OR IGNORE INTO delivery_receipts (message_id, user_id, delivered_at) VALUES (?, ?, ?)')
                                                .run(messageId, p.user_id, Date.now());
                                            // Отправляем событие delivered отправителю
                                            const senderClients = broadcast_1.clients.get(authenticatedUserId);
                                            if (senderClients) {
                                                const deliveredMsg = {
                                                    type: 'delivered',
                                                    messageId,
                                                    userId: p.user_id
                                                };
                                                for (const senderWs of senderClients) {
                                                    if (senderWs.readyState === ws_1.WebSocket.OPEN) {
                                                        senderWs.send(JSON.stringify(deliveredMsg));
                                                    }
                                                }
                                            }
                                        }
                                        catch { /* ignore */ }
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
                    if (p.user_id === authenticatedUserId)
                        continue;
                    const userClients = broadcast_1.clients.get(p.user_id);
                    const isOffline = !userClients || userClients.size === 0;
                    if (isOffline && !(0, mute_1.isMuted)(p.user_id, chatId)) {
                        logger_1.default.info({
                            userId: p.user_id,
                            clientCount: userClients?.size || 0,
                            isOffline
                        }, 'Sending push notification');
                        const messagePreview = text.length > 100 ? text.substring(0, 100) + '...' : text;
                        push_1.pushService.sendToUser(p.user_id, {
                            title: chatType === 'direct' ? senderUsername : chatName,
                            body: messagePreview,
                            data: {
                                type: 'message',
                                chatId,
                                messageId,
                            },
                            avatarUrl: senderAvatarUrl,
                        }).catch(err => logger_1.default.error({ error: err, userId: p.user_id }, 'Push notification failed'));
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
                const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chatId);
                const typingMessage = {
                    type: 'typing',
                    chatId,
                    userId: authenticatedUserId,
                    isTyping
                };
                const msgJson = JSON.stringify(typingMessage);
                for (const p of participants) {
                    if (p.user_id !== authenticatedUserId) {
                        const userClients = broadcast_1.clients.get(p.user_id);
                        if (userClients) {
                            for (const clientWs of userClients) {
                                if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                                    clientWs.send(msgJson);
                                }
                            }
                        }
                    }
                }
                logger_1.default.debug({ chatId, participants: participants.map(p => p.user_id), isTyping }, 'Typing indicator broadcast');
                if (isTyping) {
                    const timeout = setTimeout(() => {
                        typingTimeouts.delete(typingKey);
                        const stopTypingMessage = {
                            type: 'typing',
                            chatId,
                            userId: authenticatedUserId,
                            isTyping: false
                        };
                        const stopJson = JSON.stringify(stopTypingMessage);
                        for (const p of participants) {
                            if (p.user_id !== authenticatedUserId) {
                                const userClients = broadcast_1.clients.get(p.user_id);
                                if (userClients) {
                                    for (const clientWs of userClients) {
                                        if (clientWs.readyState === ws_1.WebSocket.OPEN) {
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
                const call = database_1.default.prepare('SELECT chat_id FROM calls WHERE id = ?').get(callId);
                if (!call) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Call not found' }));
                    return;
                }
                const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(call.chat_id);
                const signal = {
                    type: 'call_signal',
                    callId,
                    signalType,
                    ...(sdp && { sdp }),
                    ...(candidate && { candidate }),
                };
                const msgJson = JSON.stringify(signal);
                for (const p of participants) {
                    if (p.user_id !== authenticatedUserId) {
                        const userClients = broadcast_1.clients.get(p.user_id);
                        if (userClients) {
                            for (const clientWs of userClients) {
                                if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                                    clientWs.send(msgJson);
                                }
                            }
                        }
                    }
                }
                logger_1.default.debug({ callId, signalType }, 'Call signal relayed');
            }
            if (message.type === 'read') {
                const { messageId } = message;
                const readAt = Date.now();
                try {
                    const msgInfo = database_1.default.prepare('SELECT chat_id, user_id FROM messages WHERE id = ?').get(messageId);
                    if (!msgInfo) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Message not found' }));
                        return;
                    }
                    const isParticipant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(msgInfo.chat_id, authenticatedUserId);
                    if (!isParticipant) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Not a participant of this chat' }));
                        return;
                    }
                    // Сначала проверим delivered, если нет - запишем
                    const alreadyDelivered = database_1.default.prepare('SELECT 1 FROM delivery_receipts WHERE message_id = ? AND user_id = ?').get(messageId, authenticatedUserId);
                    if (!alreadyDelivered) {
                        database_1.default.prepare('INSERT OR IGNORE INTO delivery_receipts (message_id, user_id, delivered_at) VALUES (?, ?, ?)')
                            .run(messageId, authenticatedUserId, Date.now());
                        // Отправляем delivered отправителю
                        const senderClients = broadcast_1.clients.get(msgInfo.user_id);
                        if (senderClients) {
                            const deliveredMsg = {
                                type: 'delivered',
                                messageId,
                                userId: authenticatedUserId
                            };
                            for (const senderWs of senderClients) {
                                if (senderWs.readyState === ws_1.WebSocket.OPEN) {
                                    senderWs.send(JSON.stringify(deliveredMsg));
                                }
                            }
                        }
                    }
                    database_1.default.prepare('INSERT OR IGNORE INTO read_receipts (message_id, user_id, read_at) VALUES (?, ?, ?)')
                        .run(messageId, authenticatedUserId, readAt);
                    const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(msgInfo.chat_id);
                    const readNotification = {
                        type: 'read',
                        messageId,
                        userId: authenticatedUserId
                    };
                    const readJson = JSON.stringify(readNotification);
                    for (const p of participants) {
                        if (p.user_id !== authenticatedUserId) {
                            const userClients = broadcast_1.clients.get(p.user_id);
                            if (userClients) {
                                for (const clientWs of userClients) {
                                    if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                                        clientWs.send(readJson);
                                    }
                                }
                            }
                        }
                    }
                }
                catch (error) {
                    logger_1.default.error({ error, messageId, userId: authenticatedUserId }, 'Failed to process read receipt');
                }
            }
            if (message.type === 'sync') {
                // Client fetches messages via REST API when entering chat
            }
            if (message.type === 'sendFile') {
                const { chatId, fileId, replyTo, fileMimeType } = message;
                const chatExists = database_1.default.prepare('SELECT 1 FROM chats WHERE id = ?').get(chatId);
                if (!chatExists) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Chat not found' }));
                    return;
                }
                const isParticipant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, authenticatedUserId);
                if (!isParticipant) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Not a participant of this chat' }));
                    return;
                }
                const file = database_1.default.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
                if (!file) {
                    ws.send(JSON.stringify({ type: 'error', message: 'File not found' }));
                    return;
                }
                const messageId = (0, uuid_1.v4)();
                const timestamp = Date.now();
                const encryptedText = (0, crypto_1.encrypt)(`[File] ${file.original_name}`);
                database_1.default.prepare('INSERT INTO messages (id, chat_id, user_id, text, reply_to, file_id, file_mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                    .run(messageId, chatId, authenticatedUserId, encryptedText, replyTo || null, fileId, fileMimeType || null, timestamp);
                const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chatId);
                const serverMessage = {
                    type: 'message',
                    id: messageId,
                    chatId,
                    userId: authenticatedUserId,
                    text: `[File] ${file.original_name}`,
                    fileId,
                    file_mime_type: fileMimeType || null,
                    timestamp
                };
                const msgJson = JSON.stringify(serverMessage);
                logger_1.default.info({ chatId, fileId, messageId }, 'File message sent');
                for (const p of participants) {
                    const userClients = broadcast_1.clients.get(p.user_id);
                    if (userClients) {
                        for (const clientWs of userClients) {
                            if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                                clientWs.send(msgJson);
                            }
                        }
                    }
                }
            }
            if (message.type === 'keyExchange') {
                const { publicKey } = message;
                database_1.default.prepare(`
          INSERT INTO encryption_keys (user_id, public_key, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET public_key = ?, updated_at = ?
        `).run(authenticatedUserId, publicKey, Date.now(), Date.now(), publicKey, Date.now());
                logger_1.default.info({ userId: authenticatedUserId }, 'Public key updated');
                ws.send(JSON.stringify({ type: 'keyReceived', userId: authenticatedUserId }));
            }
            if (message.type === 'requestKey') {
                const { userId } = message;
                const keyRecord = database_1.default.prepare('SELECT public_key FROM encryption_keys WHERE user_id = ?').get(userId);
                if (keyRecord) {
                    ws.send(JSON.stringify({
                        type: 'publicKey',
                        userId,
                        publicKey: keyRecord.public_key
                    }));
                }
            }
        }
        catch (error) {
            logger_1.default.error({ error, userId: authenticatedUserId }, 'WS Message processing error');
        }
    });
    ws.on('close', () => {
        clearInterval(pingInterval);
        if (authenticatedUserId) {
            (0, broadcast_1.removeClient)(authenticatedUserId, ws);
            if (!broadcast_1.clients.has(authenticatedUserId)) {
                const userChats = database_1.default.prepare('SELECT chat_id FROM participants WHERE user_id = ?').all(authenticatedUserId);
                const offlineMsg = { type: 'online', userId: authenticatedUserId, status: 'offline' };
                const offlineJson = JSON.stringify(offlineMsg);
                for (const chat of userChats) {
                    const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chat.chat_id);
                    for (const p of participants) {
                        if (p.user_id !== authenticatedUserId) {
                            const userClients = broadcast_1.clients.get(p.user_id);
                            if (userClients) {
                                for (const clientWs of userClients) {
                                    if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                                        clientWs.send(offlineJson);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            logger_1.default.info({ userId: authenticatedUserId }, 'User disconnected from WS');
        }
    });
});
let isShuttingDown = false;
const shutdown = () => {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    logger_1.default.info('Graceful shutdown initiated. Waiting up to 10 seconds...');
    const forceExit = setTimeout(() => {
        logger_1.default.error('Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 10000);
    const totalConnections = Array.from(broadcast_1.clients.values()).reduce((sum, set) => sum + set.size, 0);
    logger_1.default.info(`Closing ${totalConnections} active WS connections...`);
    for (const wsSet of broadcast_1.clients.values()) {
        for (const ws of wsSet) {
            ws.close(1001, 'Server is shutting down');
        }
    }
    wss.close();
    server.close(() => {
        logger_1.default.info('HTTP server closed.');
        (0, database_1.closeDatabase)();
        logger_1.default.info('Database connection closed.');
        clearTimeout(forceExit);
        logger_1.default.info('Graceful shutdown complete.');
        process.exit(0);
    });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('exit', () => {
    logger_1.default.info('Process exiting');
});
process.on('uncaughtException', (err) => {
    if (err.code === 'EADDRINUSE') {
        logger_1.default.error(`Port ${port} is already in use. Try: taskkill /F /IM node.exe`);
        process.exit(1);
    }
    throw err;
});
