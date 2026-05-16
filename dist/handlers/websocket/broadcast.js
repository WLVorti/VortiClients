"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToUser = exports.getOnlineUsers = exports.broadcastToChat = exports.removeClient = exports.addClient = exports.clients = void 0;
const ws_1 = require("ws");
const database_1 = __importDefault(require("../../db/database"));
exports.clients = new Map();
const addClient = (userId, ws) => {
    if (!exports.clients.has(userId)) {
        exports.clients.set(userId, new Set());
    }
    exports.clients.get(userId).add(ws);
};
exports.addClient = addClient;
const removeClient = (userId, ws) => {
    const userClients = exports.clients.get(userId);
    if (userClients) {
        userClients.delete(ws);
        if (userClients.size === 0) {
            exports.clients.delete(userId);
        }
    }
};
exports.removeClient = removeClient;
const broadcastToChat = (chatId, message) => {
    try {
        const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chatId);
        const msgJson = JSON.stringify(message);
        for (const p of participants) {
            const userClients = exports.clients.get(p.user_id);
            if (userClients) {
                for (const clientWs of userClients) {
                    if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                        clientWs.send(msgJson);
                    }
                }
            }
        }
    }
    catch (error) {
        console.error('Broadcast to chat error:', error);
    }
};
exports.broadcastToChat = broadcastToChat;
const getOnlineUsers = () => {
    return Array.from(exports.clients.keys());
};
exports.getOnlineUsers = getOnlineUsers;
const sendToUser = (userId, message) => {
    try {
        const userClients = exports.clients.get(userId);
        if (!userClients) {
            console.log(`[WS] sendToUser: user ${userId} not found in clients`);
            return;
        }
        console.log(`[WS] sendToUser: found ${userClients.size} connections for user ${userId}`);
        const msgJson = JSON.stringify(message);
        let sentCount = 0;
        for (const clientWs of userClients) {
            if (clientWs.readyState === ws_1.WebSocket.OPEN) {
                clientWs.send(msgJson);
                sentCount++;
            }
        }
        console.log(`[WS] sendToUser: sent to ${sentCount} connections`);
    }
    catch (error) {
        console.error('Send to user error:', error);
    }
};
exports.sendToUser = sendToUser;
