"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jwt_1 = require("../auth/jwt");
/**
 * Middleware для проверки JWT токена в заголовке Authorization
 */
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = (0, jwt_1.verifyToken)(token);
    if (!decoded) {
        return res.status(401).json({ status: 'error', message: 'Invalid or expired token' });
    }
    req.userId = decoded.userId;
    req.tokenExp = decoded.exp;
    next();
};
exports.authMiddleware = authMiddleware;
