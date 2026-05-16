"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOfflineMessages = sendOfflineMessages;
const ws_1 = require("ws");
const database_1 = __importDefault(require("../../db/database"));
const logger_1 = __importDefault(require("../../utils/logger"));
const crypto_1 = require("../../utils/crypto");
const broadcast_1 = require("./broadcast");
/**
 * Отправляет пользователю сообщения, которые он мог пропустить
 * @param ws WebSocket соединение
 * @param userId ID пользователя
 * @param lastMessageId ID последнего сообщения, которое есть у клиента
 */
function sendOfflineMessages(ws, userId, lastMessageId) {
    try {
        let query = `
      SELECT m.* FROM messages m
      JOIN participants p ON m.chat_id = p.chat_id
      WHERE p.user_id = ?
    `;
        const params = [userId];
        if (lastMessageId) {
            const lastMsg = database_1.default.prepare('SELECT created_at FROM messages WHERE id = ?').get(lastMessageId);
            if (lastMsg) {
                query += ' AND m.created_at > ?';
                params.push(lastMsg.created_at);
            }
        }
        else {
            query += ` AND NOT EXISTS (
        SELECT 1 FROM read_receipts rr 
        WHERE rr.message_id = m.id AND rr.user_id = ?
      )`;
            params.push(userId);
        }
        query += ' ORDER BY m.created_at ASC';
        const offlineMessages = database_1.default.prepare(query).all(...params);
        logger_1.default.info({ userId, count: offlineMessages.length }, 'Sending offline messages to user');
        for (const msg of offlineMessages) {
            // Проверяем, было ли уже доставлено
            const alreadyDelivered = database_1.default.prepare('SELECT 1 FROM delivery_receipts WHERE message_id = ? AND user_id = ?').get(msg.id, userId);
            if (!alreadyDelivered) {
                // Записываем доставку
                database_1.default.prepare('INSERT OR IGNORE INTO delivery_receipts (message_id, user_id, delivered_at) VALUES (?, ?, ?)')
                    .run(msg.id, userId, Date.now());
                // Отправляем событие delivered отправителю
                const senderClients = broadcast_1.clients.get(msg.user_id);
                if (senderClients) {
                    const deliveredMsg = {
                        type: 'delivered',
                        messageId: msg.id,
                        userId: userId
                    };
                    for (const senderWs of senderClients) {
                        if (senderWs.readyState === ws_1.WebSocket.OPEN) {
                            senderWs.send(JSON.stringify(deliveredMsg));
                        }
                    }
                }
            }
            const serverMsg = {
                type: 'message',
                id: msg.id,
                chatId: msg.chat_id,
                userId: msg.user_id,
                text: (0, crypto_1.decrypt)(msg.text),
                fileId: msg.file_id || undefined,
                file_mime_type: msg.file_mime_type || undefined,
                timestamp: msg.created_at
            };
            ws.send(JSON.stringify(serverMsg));
        }
    }
    catch (error) {
        logger_1.default.error({ error, userId }, 'Failed to send offline messages');
    }
}
