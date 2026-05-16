"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateChatSettings = exports.getChatSettings = void 0;
const uuid_1 = require("uuid");
const database_1 = __importDefault(require("../../db/database"));
const getChatSettings = (req, res) => {
    const chatId = req.params.chatId;
    const userId = req.userId;
    try {
        const participant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
        if (!participant) {
            return res.status(403).json({ status: 'error', message: 'Not a participant of this chat' });
        }
        const settings = database_1.default.prepare('SELECT * FROM chat_settings WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
        res.json({
            status: 'success',
            settings: settings || { chatId, userId, notificationsEnabled: 1 }
        });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getChatSettings = getChatSettings;
const updateChatSettings = (req, res) => {
    const chatId = req.params.chatId;
    const userId = req.userId;
    const { notifications_enabled } = req.body;
    try {
        const participant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
        if (!participant) {
            return res.status(403).json({ status: 'error', message: 'Not a participant of this chat' });
        }
        const existing = database_1.default.prepare('SELECT id FROM chat_settings WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
        if (existing) {
            database_1.default.prepare('UPDATE chat_settings SET notifications_enabled = ? WHERE chat_id = ? AND user_id = ?')
                .run(notifications_enabled ? 1 : 0, chatId, userId);
        }
        else {
            const id = (0, uuid_1.v4)();
            database_1.default.prepare('INSERT INTO chat_settings (id, chat_id, user_id, notifications_enabled) VALUES (?, ?, ?, ?)')
                .run(id, chatId, userId, notifications_enabled ? 1 : 0);
        }
        res.json({
            status: 'success',
            settings: { chatId, userId, notificationsEnabled: notifications_enabled ? 1 : 0 }
        });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.updateChatSettings = updateChatSettings;
