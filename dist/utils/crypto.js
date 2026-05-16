"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEncryptionKey = getEncryptionKey;
exports.encrypt = encrypt;
exports.decrypt = decrypt;
const crypto_1 = __importDefault(require("crypto"));
const sanitize_1 = require("./sanitize");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
function getEncryptionKey() {
    const key = process.env.MESSAGE_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('MESSAGE_ENCRYPTION_KEY is not set in environment variables');
    }
    return Buffer.from(key, 'hex');
}
function encrypt(text) {
    if (!text)
        return text;
    const key = getEncryptionKey();
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}
function decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.includes(':'))
        return encryptedData;
    try {
        const key = getEncryptionKey();
        const parts = encryptedData.split(':');
        if (parts.length !== 3)
            return encryptedData;
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        // Unescape any HTML entities that might have been stored from old messages
        return (0, sanitize_1.unescapeHtml)(decrypted);
    }
    catch (error) {
        console.error('Decryption failed:', error);
        return encryptedData;
    }
}
