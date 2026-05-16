"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatMessages = exports.createChat = exports.getChats = void 0;
const uuid_1 = require("uuid");
const database_1 = __importDefault(require("../../db/database"));
const crypto_1 = require("../../utils/crypto");
const broadcast_1 = require("../../handlers/websocket/broadcast");
/**
 * GET /chats - Список чатов пользователя с последним сообщением
 */
const getChats = (req, res) => {
    const userId = req.userId;
    try {
        const chatsData = database_1.default.prepare(`
      SELECT 
        c.id, 
        c.name, 
        c.type, 
        c.created_at,
        c.avatar_url,
        (SELECT text FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM chats c
      JOIN participants p ON c.id = p.chat_id
      WHERE p.user_id = ?
      ORDER BY last_message_at DESC NULLS LAST
    `).all(userId);
        const onlineUsers = (0, broadcast_1.getOnlineUsers)();
        const chats = chatsData.map((chat) => {
            const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chat.id);
            let displayName = chat.name;
            let avatarUrl = null;
            let isOnline = false;
            if (chat.type === 'group') {
                avatarUrl = chat.avatar_url;
            }
            else if (!displayName && chat.type === 'direct') {
                const otherParticipantId = participants.find((p) => p.user_id !== userId);
                if (otherParticipantId) {
                    const otherUser = database_1.default.prepare('SELECT username, avatar_url FROM users WHERE id = ?').get(otherParticipantId.user_id);
                    if (otherUser) {
                        displayName = otherUser.username;
                        avatarUrl = otherUser.avatar_url;
                        isOnline = onlineUsers.includes(otherParticipantId.user_id);
                    }
                }
            }
            return {
                ...chat,
                name: displayName,
                avatarUrl,
                is_online: isOnline,
                last_message: chat.last_message ? (0, crypto_1.decrypt)(chat.last_message) : null,
                participants: participants.map(p => p.user_id)
            };
        });
        res.json({ status: 'success', chats });
    }
    catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getChats = getChats;
/**
 * POST /chats - Создание нового чата
 */
const createChat = (req, res) => {
    const { type, name, participants } = req.body;
    const currentUserId = req.userId;
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Participants are required' });
    }
    const allParticipants = Array.from(new Set([...participants, currentUserId]));
    // Проверка: нельзя создать чат только с собой
    if (allParticipants.length === 1) {
        return res.status(400).json({ status: 'error', message: 'Cannot create chat with yourself only' });
    }
    try {
        // Для direct чата проверяем существование
        if (type === 'direct' && allParticipants.length === 2) {
            const existingChat = database_1.default.prepare(`
        SELECT p1.chat_id 
        FROM participants p1
        JOIN participants p2 ON p1.chat_id = p2.chat_id
        JOIN chats c ON p1.chat_id = c.id
        WHERE c.type = 'direct' AND p1.user_id = ? AND p2.user_id = ?
      `).get(allParticipants[0], allParticipants[1]);
            if (existingChat) {
                return res.json({ status: 'success', chatId: existingChat.chat_id, message: 'Chat already exists' });
            }
        }
        const chatId = (0, uuid_1.v4)();
        const createdAt = Date.now();
        // Транзакция для создания чата и участников
        const createChatTx = database_1.default.transaction(() => {
            database_1.default.prepare('INSERT INTO chats (id, name, type, created_at) VALUES (?, ?, ?, ?)')
                .run(chatId, name || null, type, createdAt);
            const insertParticipant = database_1.default.prepare('INSERT INTO participants (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
            for (const pUserId of allParticipants) {
                const role = pUserId === currentUserId ? 'owner' : 'member';
                insertParticipant.run(chatId, pUserId, role, createdAt);
            }
        });
        createChatTx();
        res.status(201).json({ status: 'success', chatId });
    }
    catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.createChat = createChat;
/**
 * GET /chats/:id/messages - История сообщений
 */
const getChatMessages = (req, res) => {
    const chatId = req.params.id;
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;
    const before = parseInt(req.query.before) || Date.now();
    try {
        const isParticipant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
        if (!isParticipant) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }
        const messages = database_1.default.prepare(`
      SELECT * FROM messages 
      WHERE chat_id = ? AND created_at < ?
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(chatId, before, limit);
        const decryptedMessages = messages.map(msg => {
            const isRead = database_1.default.prepare('SELECT 1 FROM read_receipts WHERE message_id = ? AND user_id = ?').get(msg.id, userId);
            const isDelivered = database_1.default.prepare('SELECT 1 FROM delivery_receipts WHERE message_id = ? AND user_id = ?').get(msg.id, userId);
            let status = 'sent';
            if (isRead) {
                status = 'read';
            }
            else if (isDelivered) {
                status = 'delivered';
            }
            let replyInfo;
            if (msg.reply_to) {
                const replyMsg = database_1.default.prepare('SELECT m.id, m.text, u.username FROM messages m JOIN users u ON m.user_id = u.id WHERE m.id = ?').get(msg.reply_to);
                if (replyMsg) {
                    replyInfo = {
                        replyId: replyMsg.id,
                        replyText: (0, crypto_1.decrypt)(replyMsg.text).substring(0, 100),
                        replyUser: replyMsg.username
                    };
                }
            }
            return {
                ...msg,
                text: (0, crypto_1.decrypt)(msg.text),
                status,
                ...(replyInfo && { reply: replyInfo })
            };
        }).reverse();
        res.json({ status: 'success', messages: decryptedMessages });
    }
    catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getChatMessages = getChatMessages;
