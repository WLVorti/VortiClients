"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMuted = exports.unmuteChat = exports.muteChat = void 0;
const database_1 = __importDefault(require("../../db/database"));
const muteChat = (req, res) => {
    const chatId = req.params.chatId;
    const userId = req.userId;
    try {
        const existing = database_1.default.prepare('SELECT 1 FROM muted_chats WHERE user_id = ? AND chat_id = ?').get(userId, chatId);
        if (existing) {
            return res.json({ status: 'success', message: 'Chat already muted' });
        }
        const id = `${userId}_${chatId}`;
        database_1.default.prepare('INSERT INTO muted_chats (id, user_id, chat_id, created_at) VALUES (?, ?, ?, ?)').run(id, userId, chatId, Date.now());
        res.json({ status: 'success' });
    }
    catch (error) {
        console.error('Mute chat error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.muteChat = muteChat;
const unmuteChat = (req, res) => {
    const chatId = req.params.chatId;
    const userId = req.userId;
    try {
        database_1.default.prepare('DELETE FROM muted_chats WHERE user_id = ? AND chat_id = ?').run(userId, chatId);
        res.json({ status: 'success' });
    }
    catch (error) {
        console.error('Unmute chat error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.unmuteChat = unmuteChat;
const isMuted = (userId, chatId) => {
    const result = database_1.default.prepare('SELECT 1 FROM muted_chats WHERE user_id = ? AND chat_id = ?').get(userId, chatId);
    return !!result;
};
exports.isMuted = isMuted;
