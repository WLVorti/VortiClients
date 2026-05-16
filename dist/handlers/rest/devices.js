"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDevices = exports.unregisterAllDevices = exports.unregisterDevice = exports.registerDevice = void 0;
const push_1 = require("../../services/push");
const auth_1 = require("../../middleware/auth");
/**
 * POST /devices - Зарегистрировать устройство для push-уведомлений
 */
const registerDevice = (req, res) => {
    (0, auth_1.authMiddleware)(req, res, () => {
        const userId = req.userId;
        const { token, platform, deviceName } = req.body;
        if (!token || !platform) {
            return res.status(400).json({
                status: 'error',
                message: 'token and platform are required'
            });
        }
        if (!['android', 'ios'].includes(platform)) {
            return res.status(400).json({
                status: 'error',
                message: 'platform must be android or ios'
            });
        }
        try {
            const result = push_1.pushService.registerToken(userId, token, platform, deviceName);
            res.json({ status: 'success', ...result });
        }
        catch (error) {
            console.error('Register device error:', error);
            res.status(500).json({ status: 'error', message: 'Failed to register device' });
        }
    });
};
exports.registerDevice = registerDevice;
/**
 * DELETE /devices/:tokenId - Удалить устройство
 */
const unregisterDevice = (req, res) => {
    (0, auth_1.authMiddleware)(req, res, async () => {
        const userId = req.userId;
        const tokenId = req.params.tokenId;
        try {
            const success = await push_1.pushService.unregisterToken(tokenId, userId);
            if (success) {
                res.json({ status: 'success' });
            }
            else {
                res.status(404).json({ status: 'error', message: 'Device not found' });
            }
        }
        catch (error) {
            console.error('Unregister device error:', error);
            res.status(500).json({ status: 'error', message: 'Failed to unregister device' });
        }
    });
};
exports.unregisterDevice = unregisterDevice;
/**
 * DELETE /devices - Удалить все устройства пользователя
 */
const unregisterAllDevices = (req, res) => {
    (0, auth_1.authMiddleware)(req, res, () => {
        const userId = req.userId;
        try {
            const count = push_1.pushService.unregisterAllTokens(userId);
            res.json({ status: 'success', count });
        }
        catch (error) {
            console.error('Unregister all devices error:', error);
            res.status(500).json({ status: 'error', message: 'Failed to unregister devices' });
        }
    });
};
exports.unregisterAllDevices = unregisterAllDevices;
/**
 * GET /devices - Получить список устройств пользователя
 */
const getDevices = (req, res) => {
    (0, auth_1.authMiddleware)(req, res, () => {
        const userId = req.userId;
        try {
            const db = require('../../db/database').default;
            const devices = db.prepare('SELECT id, platform, device_name, created_at, last_active FROM push_tokens WHERE user_id = ?').all(userId);
            res.json({ status: 'success', devices });
        }
        catch (error) {
            console.error('Get devices error:', error);
            res.status(500).json({ status: 'error', message: 'Failed to get devices' });
        }
    });
};
exports.getDevices = getDevices;
