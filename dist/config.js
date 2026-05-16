"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sslConfig = exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const sslEnabled = process.env.SSL_ENABLED === 'true';
const sslCertPath = process.env.SSL_CERT_PATH || '';
const sslKeyPath = process.env.SSL_KEY_PATH || '';
const sslCaPath = process.env.SSL_CA_PATH || '';
let sslConfig;
if (sslEnabled) {
    if (!sslCertPath || !sslKeyPath) {
        throw new Error('SSL_CERT_PATH and SSL_KEY_PATH are required when SSL_ENABLED=true');
    }
    exports.sslConfig = sslConfig = {
        cert: fs_1.default.readFileSync(path_1.default.resolve(sslCertPath)),
        key: fs_1.default.readFileSync(path_1.default.resolve(sslKeyPath)),
    };
    if (sslCaPath) {
        sslConfig.ca = fs_1.default.readFileSync(path_1.default.resolve(sslCaPath));
    }
}
exports.config = {
    PORT: parseInt(process.env.PORT || '3000'),
    JWT_SECRET: process.env.JWT_SECRET || 'super_secret_key_change_me',
    JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
    NODE_ENV: process.env.NODE_ENV || 'development',
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '300000'),
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '20'),
    WS_RATE_LIMIT_MAX: parseInt(process.env.WS_RATE_LIMIT_MAX || '50'),
    MESSAGE_ENCRYPTION_KEY: process.env.MESSAGE_ENCRYPTION_KEY || '',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    SSL_ENABLED: sslEnabled,
    SSL_CONFIG: sslConfig,
};
