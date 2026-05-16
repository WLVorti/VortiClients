"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnreadCounters = exports.editMessage = exports.deleteMessage = void 0;
const database_1 = __importDefault(require("../../db/database"));
const broadcast_1 = require("../websocket/broadcast");
const logger_1 = __importDefault(require("../../utils/logger"));
const crypto_1 = require("../../utils/crypto");
/**
 * DELETE /messages/:id - Удаление сообщения (только автором)
 */
const deleteMessage = (req, res) => {
    const userId = req.userId;
    const messageId = req.params.id;
    try {
        const msg = database_1.default.prepare('SELECT user_id, chat_id FROM messages WHERE id = ?').get(messageId);
        if (!msg) {
            return res.status(404).json({ status: 'error', message: 'Message not found' });
        }
        if (msg.user_id !== userId) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to delete this message' });
        }
        const encryptedDeleted = (0, crypto_1.encrypt)('[deleted]');
        database_1.default.prepare('UPDATE messages SET text = ? WHERE id = ?').run(encryptedDeleted, messageId);
        (0, broadcast_1.broadcastToChat)(msg.chat_id, {
            type: 'message_deleted',
            messageId,
            chatId: msg.chat_id
        });
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error: error.message, stack: error.stack, messageId }, 'Delete message error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.deleteMessage = deleteMessage;
/**
 * PUT /messages/:id - Редактирование сообщения (только автором)
 */
const editMessage = (req, res) => {
    const userId = req.userId;
    const messageId = req.params.id;
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ status: 'error', message: 'Text is required' });
    }
    try {
        const msg = database_1.default.prepare('SELECT user_id, chat_id FROM messages WHERE id = ?').get(messageId);
        if (!msg) {
            return res.status(404).json({ status: 'error', message: 'Message not found' });
        }
        if (msg.user_id !== userId) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to edit this message' });
        }
        const encryptedText = (0, crypto_1.encrypt)(text);
        database_1.default.prepare('UPDATE messages SET text = ? WHERE id = ?').run(encryptedText, messageId);
        (0, broadcast_1.broadcastToChat)(msg.chat_id, {
            type: 'message_edited',
            messageId,
            chatId: msg.chat_id,
            newText: text
        });
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error: error.message, stack: error.stack, messageId }, 'Edit message error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.editMessage = editMessage;
/**
 * GET /chats/unread - Получение счетчиков непрочитанных сообщений
 */
const getUnreadCounters = (req, res) => {
    const userId = req.userId;
    try {
        const counters = database_1.default.prepare(`
      SELECT 
        m.chat_id, 
        COUNT(m.id) as unread_count
      FROM messages m
      JOIN participants p ON m.chat_id = p.chat_id
      LEFT JOIN read_receipts rr ON m.id = rr.message_id AND rr.user_id = ?
      WHERE p.user_id = ? AND rr.message_id IS NULL AND m.user_id != ?
      GROUP BY m.chat_id
    `).all(userId, userId, userId);
        const unreadMap = {};
        for (const row of counters) {
            unreadMap[row.chat_id] = row.unread_count;
        }
        res.json({ status: 'success', unread: unreadMap });
    }
    catch (error) {
        logger_1.default.error({ error, userId }, 'Get unread counters error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getUnreadCounters = getUnreadCounters;
