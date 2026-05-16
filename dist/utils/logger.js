"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const config_1 = require("../config");
/**
 * Простой логгер без внешних транспортов в режиме разработки.
 * Это гарантирует, что сервер запустится без ошибок "unable to determine transport target".
 */
const logger = (0, pino_1.default)({
    level: config_1.config.LOG_LEVEL || 'info',
    ...(config_1.config.NODE_ENV === 'production' ? {
        transport: {
            target: 'pino/file',
            options: { destination: 'app.log' }
        }
    } : {})
});
exports.default = logger;
