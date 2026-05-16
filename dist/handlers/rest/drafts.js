"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDraft = exports.getDraft = exports.saveDraft = void 0;
const database_1 = __importDefault(require("../../db/database"));
const saveDraft = (req, res) => {
    const userId = req.userId;
    const { chatId, text } = req.body;
    if (!chatId) {
        return res.status(400).json({ status: 'error', message: 'chatId is required' });
    }
    const chatExists = database_1.default.prepare('SELECT 1 FROM chats WHERE id = ?').get(chatId);
    if (!chatExists) {
        return res.status(404).json({ status: 'error', message: 'Chat not found' });
    }
    const isParticipant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
    if (!isParticipant) {
        return res.status(403).json({ status: 'error', message: 'Not a participant of this chat' });
    }
    const updatedAt = Date.now();
    database_1.default.prepare(`
        INSERT INTO drafts (user_id, chat_id, text, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, chat_id) DO UPDATE SET text = ?, updated_at = ?
    `).run(userId, chatId, text || '', updatedAt, text || '', updatedAt);
    return res.json({ status: 'success' });
};
exports.saveDraft = saveDraft;
const getDraft = (req, res) => {
    const userId = req.userId;
    const { chatId } = req.params;
    const draft = database_1.default.prepare('SELECT * FROM drafts WHERE user_id = ? AND chat_id = ?').get(userId, chatId);
    if (draft) {
        return res.json({
            status: 'success',
            draft: {
                chatId: draft.chat_id,
                text: draft.text,
                updatedAt: draft.updated_at
            }
        });
    }
    return res.json({ status: 'success', draft: null });
};
exports.getDraft = getDraft;
const deleteDraft = (req, res) => {
    const userId = req.userId;
    const { chatId } = req.params;
    database_1.default.prepare('DELETE FROM drafts WHERE user_id = ? AND chat_id = ?').run(userId, chatId);
    return res.json({ status: 'success' });
};
exports.deleteDraft = deleteDraft;
