"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCall = exports.endCall = exports.rejectCall = exports.acceptCall = exports.createCall = void 0;
const uuid_1 = require("uuid");
const database_1 = __importDefault(require("../../db/database"));
const broadcast_1 = require("../websocket/broadcast");
const push_1 = __importDefault(require("../../services/push"));
const logger_1 = __importDefault(require("../../utils/logger"));
const callPushNotification = async (userId, title, body, data, callerId) => {
    const userClients = broadcast_1.clients.get(userId);
    const isOffline = !userClients || userClients.size === 0;
    if (isOffline) {
        const callerAvatar = callerId ? database_1.default.prepare('SELECT avatar FROM users WHERE id = ?').get(callerId) : undefined;
        const avatarUrl = callerAvatar?.avatar ? `${process.env.UPLOADS_URL || 'http://77.34.76.27:3000/uploads/avatars'}/${callerAvatar.avatar}` : undefined;
        await push_1.default.sendToUser(userId, { title, body, data, avatarUrl }).catch(err => logger_1.default.error({ error: err, userId }, 'Call push notification failed'));
    }
};
const getChatId = (chatId) => {
    const id = Array.isArray(chatId) ? chatId[0] : chatId;
    if (!(0, uuid_1.validate)(id)) {
        throw new Error('Invalid chat ID');
    }
    return id;
};
const getCallId = (callId) => {
    const id = Array.isArray(callId) ? callId[0] : callId;
    if (!(0, uuid_1.validate)(id)) {
        throw new Error('Invalid call ID');
    }
    return id;
};
const createCall = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const currentUserId = req.userId;
    const { callType } = req.body;
    try {
        const participant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(chatId, currentUserId);
        if (!participant) {
            return res.status(403).json({ status: 'error', message: 'Not a participant of this chat' });
        }
        const chat = database_1.default.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        const callId = (0, uuid_1.v4)();
        const now = Date.now();
        database_1.default.prepare(`
      INSERT INTO calls (id, chat_id, caller_id, call_type, status, started_at)
      VALUES (?, ?, ?, ?, 'ringing', ?)
    `).run(callId, chatId, currentUserId, callType || 'video', now);
        const caller = database_1.default.prepare('SELECT username FROM users WHERE id = ?').get(currentUserId);
        const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(chatId);
        console.log(`[CALL] Notifying ${participants.length - 1} participants about incoming call`);
        for (const p of participants) {
            if (p.user_id !== currentUserId) {
                const userClients = broadcast_1.clients.get(p.user_id);
                const isOffline = !userClients || userClients.size === 0;
                console.log(`[CALL] Sending incoming_call to user ${p.user_id} (offline: ${isOffline})`);
                (0, broadcast_1.sendToUser)(p.user_id, {
                    type: 'incoming_call',
                    callId,
                    chatId,
                    callerId: currentUserId,
                    callerName: caller?.username || 'Unknown',
                    callType: callType || 'video',
                });
                if (isOffline) {
                    const callerAvatar = database_1.default.prepare('SELECT avatar FROM users WHERE id = ?').get(currentUserId);
                    const avatarUrl = callerAvatar?.avatar ? `${process.env.UPLOADS_URL || 'http://77.34.76.27:3000/uploads/avatars'}/${callerAvatar.avatar}` : undefined;
                    push_1.default.sendToUser(p.user_id, {
                        title: `${caller?.username || 'Someone'} is calling you`,
                        body: `Incoming ${callType || 'video'} call`,
                        data: {
                            type: 'incoming_call',
                            callId,
                            chatId,
                            callerId: currentUserId,
                        },
                        avatarUrl,
                    }).catch(err => logger_1.default.error({ error: err, userId: p.user_id }, 'Call push notification failed'));
                }
            }
        }
        logger_1.default.info({ callId, chatId, callerId: currentUserId }, 'Call created');
        res.json({
            status: 'success',
            call: {
                id: callId,
                chatId,
                callerId: currentUserId,
                callType: callType || 'video',
                status: 'ringing',
                startedAt: now,
            }
        });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Create call error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.createCall = createCall;
const acceptCall = (req, res) => {
    const callId = getCallId(req.params.callId);
    const currentUserId = req.userId;
    try {
        const call = database_1.default.prepare('SELECT * FROM calls WHERE id = ?').get(callId);
        if (!call) {
            return res.status(404).json({ status: 'error', message: 'Call not found' });
        }
        if (call.status !== 'ringing') {
            return res.status(400).json({ status: 'error', message: 'Call is not ringing' });
        }
        const participant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(call.chat_id, currentUserId);
        if (!participant) {
            return res.status(403).json({ status: 'error', message: 'Not a participant of this chat' });
        }
        database_1.default.prepare('UPDATE calls SET status = ? WHERE id = ?').run('active', callId);
        (0, broadcast_1.sendToUser)(call.caller_id, {
            type: 'call_accepted',
            callId,
            userId: currentUserId,
        });
        const acceptor = database_1.default.prepare('SELECT username FROM users WHERE id = ?').get(currentUserId);
        callPushNotification(call.caller_id, 'Call accepted', `${acceptor?.username || 'User'} accepted your call`, { type: 'call_accepted', callId }, currentUserId);
        logger_1.default.info({ callId, userId: currentUserId }, 'Call accepted');
        res.json({ status: 'success', callId, callStatus: 'active' });
    }
    catch (error) {
        logger_1.default.error({ error, callId, currentUserId }, 'Accept call error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.acceptCall = acceptCall;
const rejectCall = (req, res) => {
    const callId = getCallId(req.params.callId);
    const currentUserId = req.userId;
    try {
        const call = database_1.default.prepare('SELECT * FROM calls WHERE id = ?').get(callId);
        if (!call) {
            return res.status(404).json({ status: 'error', message: 'Call not found' });
        }
        if (call.status !== 'ringing') {
            return res.status(400).json({ status: 'error', message: 'Call is not ringing' });
        }
        database_1.default.prepare('UPDATE calls SET status = ? WHERE id = ?').run('rejected', callId);
        (0, broadcast_1.sendToUser)(call.caller_id, {
            type: 'call_rejected',
            callId,
            userId: currentUserId,
        });
        const rejector = database_1.default.prepare('SELECT username FROM users WHERE id = ?').get(currentUserId);
        callPushNotification(call.caller_id, 'Call rejected', `${rejector?.username || 'User'} rejected your call`, { type: 'call_rejected', callId }, currentUserId);
        logger_1.default.info({ callId, userId: currentUserId }, 'Call rejected');
        res.json({ status: 'success', callId: callId, callStatus: 'rejected' });
    }
    catch (error) {
        logger_1.default.error({ error, callId, currentUserId }, 'Reject call error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.rejectCall = rejectCall;
const endCall = (req, res) => {
    const callId = getCallId(req.params.callId);
    const currentUserId = req.userId;
    try {
        const call = database_1.default.prepare('SELECT * FROM calls WHERE id = ?').get(callId);
        if (!call) {
            return res.status(404).json({ status: 'error', message: 'Call not found' });
        }
        const participant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(call.chat_id, currentUserId);
        if (!participant && call.caller_id !== currentUserId) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to end this call' });
        }
        const now = Date.now();
        database_1.default.prepare('UPDATE calls SET status = ?, ended_at = ? WHERE id = ?').run('ended', now, callId);
        const participants = database_1.default.prepare('SELECT user_id FROM participants WHERE chat_id = ?').all(call.chat_id);
        for (const p of participants) {
            (0, broadcast_1.sendToUser)(p.user_id, {
                type: 'call_ended',
                callId,
                endedBy: currentUserId,
            });
            callPushNotification(p.user_id, 'Call ended', 'The call has ended', { type: 'call_ended', callId }, currentUserId);
        }
        logger_1.default.info({ callId, userId: currentUserId }, 'Call ended');
        res.json({ status: 'success', callId: callId, callStatus: 'ended', endedAt: now });
    }
    catch (error) {
        logger_1.default.error({ error, callId, currentUserId }, 'End call error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.endCall = endCall;
const getCall = (req, res) => {
    const callId = getCallId(req.params.callId);
    const currentUserId = req.userId;
    try {
        const call = database_1.default.prepare('SELECT * FROM calls WHERE id = ?').get(callId);
        if (!call) {
            return res.status(404).json({ status: 'error', message: 'Call not found' });
        }
        const participant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(call.chat_id, currentUserId);
        if (!participant && call.caller_id !== currentUserId) {
            return res.status(403).json({ status: 'error', message: 'Not authorized to view this call' });
        }
        res.json({
            status: 'success',
            call: {
                id: call.id,
                chatId: call.chat_id,
                callerId: call.caller_id,
                callType: call.call_type,
                status: call.status,
                startedAt: call.started_at,
                endedAt: call.ended_at,
            }
        });
    }
    catch (error) {
        logger_1.default.error({ error, callId, currentUserId }, 'Get call error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getCall = getCall;
