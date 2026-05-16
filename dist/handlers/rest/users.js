"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserPublicKey = exports.getUsers = void 0;
const database_1 = __importDefault(require("../../db/database"));
/**
 * GET /users - Список пользователей с поиском
 */
const getUsers = (req, res) => {
    const currentUserId = req.userId;
    const search = req.query.search;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    try {
        let query = 'SELECT id, username, avatar_url, created_at FROM users WHERE id != ?';
        const params = [currentUserId];
        if (search) {
            query += ' AND username LIKE ?';
            params.push(`%${search}%`);
        }
        query += ' LIMIT ?';
        params.push(limit);
        const users = database_1.default.prepare(query).all(...params);
        res.json({ status: 'success', users });
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getUsers = getUsers;
/**
 * GET /users/:userId/public-key - Получить публичный ключ пользователя
 */
const getUserPublicKey = (req, res) => {
    const { userId } = req.params;
    try {
        const keyRecord = database_1.default.prepare('SELECT public_key FROM encryption_keys WHERE user_id = ?').get(userId);
        if (!keyRecord) {
            return res.status(404).json({ status: 'error', message: 'Public key not found' });
        }
        res.json({
            status: 'success',
            publicKey: keyRecord.public_key
        });
    }
    catch (error) {
        console.error('Get public key error:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getUserPublicKey = getUserPublicKey;
