"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = exports.deleteAvatar = exports.uploadAvatar = exports.updateProfile = exports.getProfile = exports.uploadAvatarMiddleware = void 0;
const database_1 = __importDefault(require("../../db/database"));
const sanitize_1 = require("../../utils/sanitize");
const uuid_1 = require("uuid");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: './uploads/avatars',
        filename: (req, file, cb) => {
            const ext = path_1.default.extname(file.originalname);
            cb(null, `${(0, uuid_1.v4)()}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowed.test(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only images are allowed'));
        }
    }
});
exports.uploadAvatarMiddleware = upload.single('avatar');
const getProfile = (req, res) => {
    const userId = req.userId;
    try {
        const user = database_1.default.prepare(`
      SELECT id, username, display_name, bio, avatar_url, created_at
      FROM users WHERE id = ?
    `).get(userId);
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }
        return res.json({
            status: 'success',
            profile: {
                id: user.id,
                username: user.username,
                displayName: user.display_name || user.username,
                bio: user.bio || '',
                avatarUrl: user.avatar_url || null,
                createdAt: user.created_at
            }
        });
    }
    catch (error) {
        console.error('Get profile error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getProfile = getProfile;
const updateProfile = (req, res) => {
    const userId = req.userId;
    const { displayName, bio } = req.body;
    try {
        const updates = [];
        const values = [];
        if (displayName !== undefined) {
            const safeName = (0, sanitize_1.escapeHtml)(displayName).substring(0, 50);
            updates.push('display_name = ?');
            values.push(safeName);
        }
        if (bio !== undefined) {
            const safeBio = (0, sanitize_1.escapeHtml)(bio).substring(0, 160);
            updates.push('bio = ?');
            values.push(safeBio);
        }
        if (updates.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No fields to update' });
        }
        updates.push('updated_at = ?');
        values.push(Date.now());
        values.push(userId);
        database_1.default.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        const user = database_1.default.prepare(`
      SELECT id, username, display_name, bio, avatar_url, created_at
      FROM users WHERE id = ?
    `).get(userId);
        return res.json({
            status: 'success',
            profile: {
                id: user.id,
                username: user.username,
                displayName: user.display_name || user.username,
                bio: user.bio || '',
                avatarUrl: user.avatar_url || null,
                createdAt: user.created_at
            }
        });
    }
    catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.updateProfile = updateProfile;
const uploadAvatar = (req, res) => {
    const userId = req.userId;
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }
    try {
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        database_1.default.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?')
            .run(avatarUrl, Date.now(), userId);
        return res.json({
            status: 'success',
            avatarUrl
        });
    }
    catch (error) {
        console.error('Upload avatar error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.uploadAvatar = uploadAvatar;
const deleteAvatar = (req, res) => {
    const userId = req.userId;
    try {
        database_1.default.prepare('UPDATE users SET avatar_url = NULL, updated_at = ? WHERE id = ?')
            .run(Date.now(), userId);
        return res.json({ status: 'success' });
    }
    catch (error) {
        console.error('Delete avatar error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.deleteAvatar = deleteAvatar;
const getUserProfile = (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.userId;
    try {
        const user = database_1.default.prepare(`
      SELECT id, username, display_name, bio, avatar_url, created_at
      FROM users WHERE id = ?
    `).get(userId);
        if (!user) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }
        return res.json({
            status: 'success',
            profile: {
                id: user.id,
                username: user.username,
                displayName: user.display_name || user.username,
                bio: user.bio || '',
                avatarUrl: user.avatar_url || null,
                createdAt: user.created_at
            }
        });
    }
    catch (error) {
        console.error('Get user profile error:', error);
        return res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getUserProfile = getUserProfile;
