"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
exports.generateToken = generateToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const isProduction = process.env.NODE_ENV === 'production';
const envSecret = process.env.JWT_SECRET;
const jwtExpiry = process.env.JWT_EXPIRY || '7d';
if (!envSecret) {
    if (isProduction) {
        console.error('\x1b[91m[FATAL]\x1b[0m JWT_SECRET is not set in production mode!');
        console.error('Please set JWT_SECRET in your .env file or environment variables.');
        process.exit(1);
    }
    else {
        console.warn('\x1b[93m[WARNING]\x1b[0m JWT_SECRET not set. Using a random secret for development only.');
        console.warn('This is NOT secure for production!');
    }
}
exports.JWT_SECRET = envSecret || crypto_1.default.randomBytes(64).toString('hex');
/**
 * Генерирует JWT токен для пользователя
 * @param userId ID пользователя
 * @returns Строка токена
 */
function generateToken(userId) {
    const expiresIn = process.env.JWT_EXPIRY || '7d';
    return jsonwebtoken_1.default.sign({ userId }, exports.JWT_SECRET, { expiresIn });
}
/**
 * Проверяет JWT токен
 * @param token Токен для проверки
 * @returns Объект с userId или null, если токен невалиден
 */
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, exports.JWT_SECRET);
        return decoded;
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            console.warn('JWT token expired');
        }
        else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            console.warn('Invalid JWT token:', error.message);
        }
        return null;
    }
}
