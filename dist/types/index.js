"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsClientSchema = exports.wsRequestKeySchema = exports.wsKeyExchangeSchema = exports.wsPingSchema = exports.wsSyncSchema = exports.wsReadSchema = exports.wsTypingSchema = exports.wsSendFileSchema = exports.wsSendSchema = exports.wsAuthSchema = void 0;
const zod_1 = require("zod");
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidSchema = zod_1.z.string().regex(uuidRegex, 'Invalid UUID format');
exports.wsAuthSchema = zod_1.z.object({
    type: zod_1.z.literal('auth'),
    token: zod_1.z.string().min(1),
});
exports.wsSendSchema = zod_1.z.object({
    type: zod_1.z.literal('send'),
    chatId: zod_1.z.string().regex(uuidRegex, 'Invalid chat ID format'),
    text: zod_1.z.string().min(1).max(5000),
    replyTo: zod_1.z.string().regex(uuidRegex).optional(),
});
exports.wsSendFileSchema = zod_1.z.object({
    type: zod_1.z.literal('sendFile'),
    chatId: zod_1.z.string().regex(uuidRegex, 'Invalid chat ID format'),
    fileId: zod_1.z.string().regex(uuidRegex, 'Invalid file ID format'),
    replyTo: zod_1.z.string().regex(uuidRegex).optional(),
});
exports.wsTypingSchema = zod_1.z.object({
    type: zod_1.z.literal('typing'),
    chatId: zod_1.z.string().regex(uuidRegex, 'Invalid chat ID format'),
    isTyping: zod_1.z.boolean(),
});
exports.wsReadSchema = zod_1.z.object({
    type: zod_1.z.literal('read'),
    messageId: zod_1.z.string().regex(uuidRegex, 'Invalid message ID format'),
});
exports.wsSyncSchema = zod_1.z.object({
    type: zod_1.z.literal('sync'),
    lastMessageId: zod_1.z.string().optional(),
});
exports.wsPingSchema = zod_1.z.object({
    type: zod_1.z.literal('ping'),
});
exports.wsKeyExchangeSchema = zod_1.z.object({
    type: zod_1.z.literal('keyExchange'),
    publicKey: zod_1.z.string().min(1),
});
exports.wsRequestKeySchema = zod_1.z.object({
    type: zod_1.z.literal('requestKey'),
    userId: zod_1.z.string().regex(uuidRegex, 'Invalid user ID format'),
});
exports.wsClientSchema = zod_1.z.union([
    exports.wsAuthSchema,
    exports.wsSendSchema,
    exports.wsSendFileSchema,
    exports.wsTypingSchema,
    exports.wsReadSchema,
    exports.wsSyncSchema,
    exports.wsPingSchema,
    exports.wsKeyExchangeSchema,
    exports.wsRequestKeySchema,
]);
