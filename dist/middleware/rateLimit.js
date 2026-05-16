"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSRateLimiter = exports.authRateLimit = exports.getRateLimitStatus = exports.clearRateLimits = void 0;
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const loginRegisterStore = new Map();
const clearRateLimits = () => {
    loginRegisterStore.clear();
    logger_1.default.info('Rate limits cleared');
};
exports.clearRateLimits = clearRateLimits;
const getRateLimitStatus = (ip) => {
    return loginRegisterStore.get(ip);
};
exports.getRateLimitStatus = getRateLimitStatus;
/**
 * Ограничивает количество попыток регистрации и логина
 */
const authRateLimit = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = loginRegisterStore.get(ip);
    if (!record || now > record.resetTime) {
        loginRegisterStore.set(ip, {
            count: 1,
            resetTime: now + config_1.config.RATE_LIMIT_WINDOW_MS,
        });
        return next();
    }
    if (record.count >= config_1.config.RATE_LIMIT_MAX_REQUESTS) {
        const remainingSeconds = Math.ceil((record.resetTime - now) / 1000);
        logger_1.default.warn({ ip, remainingSeconds }, 'Rate limit exceeded for auth endpoint');
        return res.status(429).json({
            status: 'error',
            message: `Too many attempts. Try again in ${remainingSeconds} seconds.`,
            retryAfter: remainingSeconds,
        });
    }
    record.count += 1;
    next();
};
exports.authRateLimit = authRateLimit;
/**
 * Ограничитель для WebSocket сообщений
 */
class WSRateLimiter {
    constructor() {
        this.messageCount = 0;
        this.lastReset = Date.now();
    }
    checkLimit() {
        const now = Date.now();
        if (now - this.lastReset > 1000) {
            this.messageCount = 0;
            this.lastReset = now;
        }
        if (this.messageCount >= config_1.config.WS_RATE_LIMIT_MAX) {
            return false;
        }
        this.messageCount += 1;
        return true;
    }
}
exports.WSRateLimiter = WSRateLimiter;
