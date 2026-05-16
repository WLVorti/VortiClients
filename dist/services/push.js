"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const google_auth_library_1 = require("google-auth-library");
const database_1 = __importDefault(require("../db/database"));
const logger_1 = __importDefault(require("../utils/logger"));
const path_1 = __importDefault(require("path"));
const UPLOADS_URL = 'http://77.34.76.27:3000/uploads/avatars';
function getAvatarUrl(path) {
    if (!path)
        return '';
    if (path.startsWith('http'))
        return path;
    return `${UPLOADS_URL}/${path.split('/').pop()}`;
}
class PushService {
    constructor() {
        this.projectId = 'vorti-messenger';
        this.auth = null;
        this.isConfigured = false;
        this.serviceAccountPath = path_1.default.join(process.cwd(), 'src/config/firebase-service-account.json');
        try {
            const fs = require('fs');
            if (fs.existsSync(this.serviceAccountPath)) {
                this.auth = new google_auth_library_1.GoogleAuth({
                    keyFile: this.serviceAccountPath,
                    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
                });
                this.isConfigured = true;
                logger_1.default.info('Push notifications initialized with FCM V1 API');
            }
            else {
                logger_1.default.warn('Firebase service account not found. Push notifications disabled.');
            }
        }
        catch (error) {
            logger_1.default.error({ error }, 'Failed to initialize Firebase auth');
        }
    }
    async sendToUser(userId, payload) {
        if (!this.isConfigured) {
            logger_1.default.debug('Push not configured, skipping notification');
            return;
        }
        const tokens = this.getUserTokens(userId);
        if (tokens.length === 0) {
            logger_1.default.debug({ userId }, 'No push tokens for user');
            return;
        }
        logger_1.default.debug({ userId, tokenCount: tokens.length, latestTokenId: tokens[0].id }, 'Sending push');
        const latestToken = tokens[0];
        try {
            if (latestToken.platform === 'android') {
                await this.sendAndroid(latestToken.token, payload);
            }
            else if (latestToken.platform === 'ios') {
                await this.sendIOS(latestToken.token, payload);
            }
        }
        catch (error) {
            logger_1.default.error({ error, tokenId: latestToken.id }, 'Failed to send push');
        }
    }
    async getAccessToken() {
        if (!this.auth) {
            throw new Error('Firebase not configured');
        }
        const client = await this.auth.getClient();
        const tokenResponse = await client.getAccessToken();
        return tokenResponse.token || '';
    }
    async sendAndroid(token, payload) {
        const accessToken = await this.getAccessToken();
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: {
                    token,
                    notification: {
                        title: payload.title,
                        body: payload.body,
                    },
                    data: {
                        type: payload.data?.type || 'message',
                        chatId: payload.data?.chatId || '',
                        messageId: payload.data?.messageId || '',
                        avatarUrl: getAvatarUrl(payload.avatarUrl),
                    },
                    android: {
                        notification: {
                            channel_id: 'vorti_messages',
                        },
                    },
                },
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            logger_1.default.error({ status: response.status, error }, 'FCM Android send failed');
        }
    }
    async sendIOS(token, payload) {
        const accessToken = await this.getAccessToken();
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: {
                    token,
                    notification: {
                        title: payload.title,
                        body: payload.body,
                    },
                    data: {
                        type: payload.data?.type || 'message',
                        chatId: payload.data?.chatId || '',
                        messageId: payload.data?.messageId || '',
                        avatarUrl: getAvatarUrl(payload.avatarUrl),
                    },
                },
            }),
        });
        if (!response.ok) {
            const error = await response.text();
            logger_1.default.error({ status: response.status, error }, 'FCM iOS send failed');
        }
    }
    getUserTokens(userId) {
        const tokens = database_1.default.prepare('SELECT * FROM push_tokens WHERE user_id = ? ORDER BY last_active DESC').all(userId);
        logger_1.default.debug({ userId, tokenCount: tokens.length, tokens: tokens.map(t => ({ id: t.id, token: t.token?.slice(-10) })) }, 'getUserTokens');
        return tokens;
    }
    async registerToken(userId, token, platform, deviceName) {
        const now = Date.now();
        const existing = database_1.default.prepare('SELECT id FROM push_tokens WHERE token = ?').get(token);
        if (existing) {
            database_1.default.prepare(`
                UPDATE push_tokens SET user_id = ?, platform = ?, device_name = ?, last_active = ?
                WHERE token = ?
            `).run(userId, platform, deviceName || '', now, token);
            logger_1.default.info({ userId, platform }, 'Push token updated');
            return { id: existing.id };
        }
        database_1.default.prepare(`
            DELETE FROM push_tokens WHERE user_id = ?
        `).run(userId);
        const id = crypto_1.default.randomUUID();
        database_1.default.prepare(`
            INSERT INTO push_tokens (id, user_id, token, platform, device_name, created_at, last_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, userId, token, platform, deviceName || '', now, now);
        logger_1.default.info({ userId, platform }, 'Push token registered');
        return { id };
    }
    async unregisterToken(tokenId, userId) {
        const result = database_1.default.prepare('DELETE FROM push_tokens WHERE id = ? AND user_id = ?').run(tokenId, userId);
        if (result.changes > 0) {
            logger_1.default.info({ tokenId, userId }, 'Push token unregistered');
            return true;
        }
        return false;
    }
    async unregisterAllTokens(userId) {
        const result = database_1.default.prepare('DELETE FROM push_tokens WHERE user_id = ?').run(userId);
        logger_1.default.info({ userId, count: result.changes }, 'All push tokens unregistered');
        return result.changes;
    }
    updateTokenActivity(token) {
        database_1.default.prepare('UPDATE push_tokens SET last_active = ? WHERE token = ?').run(Date.now(), token);
    }
    cleanupInactiveTokens(daysInactive = 90) {
        const cutoff = Date.now() - (daysInactive * 24 * 60 * 60 * 1000);
        const result = database_1.default.prepare('DELETE FROM push_tokens WHERE last_active < ?').run(cutoff);
        if (result.changes > 0) {
            logger_1.default.info({ count: result.changes }, 'Cleaned up inactive push tokens');
        }
        return result.changes;
    }
}
exports.pushService = new PushService();
exports.default = exports.pushService;
