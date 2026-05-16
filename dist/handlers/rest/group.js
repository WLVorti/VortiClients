"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGroupAvatar = exports.uploadGroupAvatar = exports.getParticipants = exports.updateGroupName = exports.setParticipantRole = exports.deleteGroup = exports.leaveGroup = exports.removeParticipant = exports.addParticipant = exports.transferOwnership = exports.getChatInfo = exports.isParticipant = exports.uploadGroupAvatarMiddleware = void 0;
const uuid_1 = require("uuid");
const database_1 = __importDefault(require("../../db/database"));
const broadcast_1 = require("../websocket/broadcast");
const logger_1 = __importDefault(require("../../utils/logger"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const getChatId = (chatId) => {
    const id = Array.isArray(chatId) ? chatId[0] : chatId;
    if (!(0, uuid_1.validate)(id)) {
        throw new Error('Invalid chat ID');
    }
    return id;
};
const getUserId = (userId) => {
    const id = Array.isArray(userId) ? userId[0] : userId;
    if (!(0, uuid_1.validate)(id)) {
        throw new Error('Invalid user ID');
    }
    return id;
};
const isGroupOwner = (chatId, userId) => {
    const participant = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
    return participant?.role === 'owner';
};
const isGroupAdmin = (chatId, userId) => {
    const participant = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
    return participant?.role === 'owner' || participant?.role === 'admin';
};
const groupUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: './uploads/group-avatars',
        filename: (req, file, cb) => {
            const ext = path_1.default.extname(file.originalname);
            cb(null, `${(0, uuid_1.v4)()}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (allowed.test(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only images are allowed'));
        }
    }
});
if (!fs_1.default.existsSync('./uploads/group-avatars')) {
    fs_1.default.mkdirSync('./uploads/group-avatars', { recursive: true });
}
exports.uploadGroupAvatarMiddleware = groupUpload.single('avatar');
const isParticipant = (chatId, userId) => {
    const participant = database_1.default.prepare('SELECT 1 FROM participants WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
    return !!participant;
};
exports.isParticipant = isParticipant;
const getChatInfo = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const currentUserId = req.userId;
    try {
        if (!(0, exports.isParticipant)(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Not a participant' });
        }
        const chat = database_1.default.prepare(`
            SELECT c.id, c.name, c.type, c.created_at, c.avatar_url,
                (SELECT COUNT(*) FROM participants WHERE chat_id = c.id) as participants_count
            FROM chats c WHERE c.id = ?
        `).get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        let currentUserRole;
        if (chat.type === 'group') {
            const p = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?')
                .get(chatId, currentUserId);
            currentUserRole = p?.role;
        }
        res.json({
            status: 'success',
            chat: {
                id: chat.id,
                name: chat.name,
                type: chat.type,
                createdAt: chat.created_at,
                avatarUrl: chat.avatar_url,
                participantsCount: chat.participants_count,
                ...(currentUserRole && { role: currentUserRole })
            }
        });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Get chat info error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getChatInfo = getChatInfo;
/**
 * PUT /chats/:chatId/transfer - Передать права owner другому участнику
 */
const transferOwnership = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const { userId: newOwnerId } = req.body;
    const currentUserId = req.userId;
    if (!newOwnerId) {
        return res.status(400).json({ status: 'error', message: 'userId is required' });
    }
    try {
        const chat = database_1.default.prepare('SELECT type, name FROM chats WHERE id = ?').get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        if (chat.type !== 'group') {
            return res.status(400).json({ status: 'error', message: 'Only group chats support transfer' });
        }
        if (!isGroupOwner(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Only owner can transfer ownership' });
        }
        const newOwnerParticipant = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(chatId, newOwnerId);
        if (!newOwnerParticipant) {
            return res.status(404).json({ status: 'error', message: 'Target user is not a participant' });
        }
        // Меняем роли
        database_1.default.prepare('UPDATE participants SET role = ? WHERE chat_id = ? AND user_id = ?')
            .run('member', chatId, currentUserId);
        database_1.default.prepare('UPDATE participants SET role = ? WHERE chat_id = ? AND user_id = ?')
            .run('owner', chatId, newOwnerId);
        (0, broadcast_1.broadcastToChat)(chatId, {
            type: 'role_changed',
            chatId,
            userId: currentUserId,
            role: 'member',
            changedBy: currentUserId
        });
        (0, broadcast_1.broadcastToChat)(chatId, {
            type: 'role_changed',
            chatId,
            userId: newOwnerId,
            role: 'owner',
            changedBy: currentUserId
        });
        logger_1.default.info({ chatId, oldOwner: currentUserId, newOwner: newOwnerId }, 'Ownership transferred');
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Transfer ownership error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.transferOwnership = transferOwnership;
/**
 * POST /chats/:chatId/participants - Добавить участника в группу
 */
const addParticipant = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const { userId: newUserId } = req.body;
    const currentUserId = req.userId;
    if (!newUserId) {
        return res.status(400).json({ status: 'error', message: 'userId is required' });
    }
    try {
        const chat = database_1.default.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        if (chat.type !== 'group') {
            return res.status(400).json({ status: 'error', message: 'Only group chats support adding participants' });
        }
        if (!(0, exports.isParticipant)(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'You are not a participant of this chat' });
        }
        if (!isGroupAdmin(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Only admins can add participants' });
        }
        if ((0, exports.isParticipant)(chatId, newUserId)) {
            return res.status(400).json({ status: 'error', message: 'User is already a participant' });
        }
        const userExists = database_1.default.prepare('SELECT id FROM users WHERE id = ?').get(newUserId);
        if (!userExists) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }
        const joinedAt = Date.now();
        database_1.default.prepare('INSERT INTO participants (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)')
            .run(chatId, newUserId, 'member', joinedAt);
        const chatName = database_1.default.prepare('SELECT name FROM chats WHERE id = ?').get(chatId);
        (0, broadcast_1.broadcastToChat)(chatId, {
            type: 'participant_added',
            chatId,
            userId: newUserId,
            addedBy: currentUserId
        });
        logger_1.default.info({ chatId, newUserId, addedBy: currentUserId }, 'Participant added to group');
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Add participant error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.addParticipant = addParticipant;
/**
 * DELETE /chats/:chatId/participants/:userId - Удалить участника из группы
 */
const removeParticipant = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const targetUserId = getUserId(req.params.userId);
    const currentUserId = req.userId;
    try {
        const chat = database_1.default.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        if (chat.type !== 'group') {
            return res.status(400).json({ status: 'error', message: 'Only group chats support removing participants' });
        }
        if (!(0, exports.isParticipant)(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'You are not a participant of this chat' });
        }
        const targetParticipant = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(chatId, targetUserId);
        if (!targetParticipant) {
            return res.status(404).json({ status: 'error', message: 'Target user is not a participant' });
        }
        // Проверка прав на удаление
        const isSelfRemove = targetUserId === currentUserId;
        if (!isSelfRemove && !isGroupAdmin(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Only admins can remove other participants' });
        }
        if (targetParticipant.role === 'owner') {
            return res.status(403).json({ status: 'error', message: 'Cannot remove owner' });
        }
        if (targetParticipant.role === 'admin' && !isGroupOwner(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Only owner can remove admins' });
        }
        database_1.default.prepare('DELETE FROM participants WHERE chat_id = ? AND user_id = ?').run(chatId, targetUserId);
        (0, broadcast_1.broadcastToChat)(chatId, {
            type: 'participant_removed',
            chatId,
            userId: targetUserId,
            removedBy: currentUserId
        });
        logger_1.default.info({ chatId, targetUserId, removedBy: currentUserId }, 'Participant removed from group');
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Remove participant error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.removeParticipant = removeParticipant;
/**
 * DELETE /chats/:chatId/leave - Покинуть группу
 */
const leaveGroup = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const currentUserId = req.userId;
    try {
        const chat = database_1.default.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        if (chat.type !== 'group') {
            return res.status(400).json({ status: 'error', message: 'Cannot leave direct chat' });
        }
        const participant = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(chatId, currentUserId);
        if (!participant) {
            return res.status(404).json({ status: 'error', message: 'You are not a participant' });
        }
        if (participant.role === 'owner') {
            return res.status(403).json({ status: 'error', message: 'Owner cannot leave. Transfer ownership first or delete the group.' });
        }
        database_1.default.prepare('DELETE FROM participants WHERE chat_id = ? AND user_id = ?').run(chatId, currentUserId);
        (0, broadcast_1.broadcastToChat)(chatId, {
            type: 'participant_removed',
            chatId,
            userId: currentUserId,
            removedBy: currentUserId
        });
        logger_1.default.info({ chatId, userId: currentUserId }, 'User left group');
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Leave group error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.leaveGroup = leaveGroup;
/**
 * DELETE /chats/:chatId - Удалить группу (только owner)
 */
const deleteGroup = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const currentUserId = req.userId;
    try {
        const chat = database_1.default.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        if (chat.type !== 'group') {
            return res.status(400).json({ status: 'error', message: 'Cannot delete direct chat' });
        }
        if (!isGroupOwner(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Only owner can delete the group' });
        }
        // Удаляем всех участников и чат (CASCADE удалит связанные записи)
        database_1.default.prepare('DELETE FROM participants WHERE chat_id = ?').run(chatId);
        database_1.default.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
        (0, broadcast_1.broadcastToChat)(chatId, {
            type: 'group_deleted',
            chatId,
            deletedBy: currentUserId
        });
        logger_1.default.info({ chatId, deletedBy: currentUserId }, 'Group deleted');
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Delete group error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.deleteGroup = deleteGroup;
/**
 * PUT /chats/:chatId/participants/:userId/role - Изменить роль участника
 */
const setParticipantRole = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const targetUserId = getUserId(req.params.userId);
    const { role } = req.body;
    const currentUserId = req.userId;
    if (!role || !['admin', 'member'].includes(role)) {
        return res.status(400).json({ status: 'error', message: 'Role must be admin or member' });
    }
    try {
        const chat = database_1.default.prepare('SELECT type FROM chats WHERE id = ?').get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        if (chat.type !== 'group') {
            return res.status(400).json({ status: 'error', message: 'Only group chats support roles' });
        }
        if (!isGroupOwner(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Only owner can change roles' });
        }
        const targetParticipant = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(chatId, targetUserId);
        if (!targetParticipant) {
            return res.status(404).json({ status: 'error', message: 'Target user is not a participant' });
        }
        if (targetParticipant.role === 'owner') {
            return res.status(403).json({ status: 'error', message: 'Cannot change owner role' });
        }
        database_1.default.prepare('UPDATE participants SET role = ? WHERE chat_id = ? AND user_id = ?')
            .run(role, chatId, targetUserId);
        (0, broadcast_1.broadcastToChat)(chatId, {
            type: 'role_changed',
            chatId,
            userId: targetUserId,
            role,
            changedBy: currentUserId
        });
        logger_1.default.info({ chatId, targetUserId, role, changedBy: currentUserId }, 'Participant role changed');
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Set role error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.setParticipantRole = setParticipantRole;
/**
 * PUT /chats/:chatId/name - Изменить название группы
 */
const updateGroupName = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const { name } = req.body;
    const currentUserId = req.userId;
    if (!name || typeof name !== 'string' || name.length > 50) {
        return res.status(400).json({ status: 'error', message: 'Name must be 1-50 characters' });
    }
    try {
        const chat = database_1.default.prepare('SELECT type, name FROM chats WHERE id = ?').get(chatId);
        if (!chat) {
            return res.status(404).json({ status: 'error', message: 'Chat not found' });
        }
        if (chat.type !== 'group') {
            return res.status(400).json({ status: 'error', message: 'Only group chats have names' });
        }
        if (!isGroupAdmin(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Only admins can change group name' });
        }
        database_1.default.prepare('UPDATE chats SET name = ? WHERE id = ?').run(name, chatId);
        (0, broadcast_1.broadcastToChat)(chatId, {
            type: 'group_name_changed',
            chatId,
            name,
            changedBy: currentUserId
        });
        logger_1.default.info({ chatId, name, changedBy: currentUserId }, 'Group name changed');
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Update group name error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.updateGroupName = updateGroupName;
/**
 * GET /chats/:chatId/participants - Получить участников группы
 */
const getParticipants = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const currentUserId = req.userId;
    try {
        if (!(0, exports.isParticipant)(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'You are not a participant of this chat' });
        }
        const participants = database_1.default.prepare(`
            SELECT p.user_id, p.role, u.username, u.avatar_url
            FROM participants p
            JOIN users u ON p.user_id = u.id
            WHERE p.chat_id = ?
            ORDER BY 
                CASE p.role 
                    WHEN 'owner' THEN 1 
                    WHEN 'admin' THEN 2 
                    ELSE 3 
                END
        `).all(chatId);
        res.json({ status: 'success', participants });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Get participants error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.getParticipants = getParticipants;
const uploadGroupAvatar = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const currentUserId = req.userId;
    try {
        if (!(0, exports.isParticipant)(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Not a participant' });
        }
        const participant = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(chatId, currentUserId);
        if (!participant || (participant.role !== 'owner' && participant.role !== 'admin')) {
            return res.status(403).json({ status: 'error', message: 'Only owner and admin can change avatar' });
        }
        const chat = database_1.default.prepare('SELECT type, avatar_url FROM chats WHERE id = ?').get(chatId);
        if (!chat || chat.type !== 'group') {
            return res.status(404).json({ status: 'error', message: 'Group not found' });
        }
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'No file uploaded' });
        }
        const oldAvatarUrl = chat.avatar_url;
        const newAvatarUrl = `/uploads/group-avatars/${req.file.filename}`;
        database_1.default.prepare('UPDATE chats SET avatar_url = ? WHERE id = ?').run(newAvatarUrl, chatId);
        if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/group-avatars/')) {
            const oldPath = `.${oldAvatarUrl}`;
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
        (0, broadcast_1.broadcastToChat)(chatId, { type: 'group_avatar_changed', chatId, avatarUrl: newAvatarUrl });
        res.json({ status: 'success', avatarUrl: newAvatarUrl });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Upload group avatar error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.uploadGroupAvatar = uploadGroupAvatar;
const deleteGroupAvatar = (req, res) => {
    const chatId = getChatId(req.params.chatId);
    const currentUserId = req.userId;
    try {
        if (!(0, exports.isParticipant)(chatId, currentUserId)) {
            return res.status(403).json({ status: 'error', message: 'Not a participant' });
        }
        const participant = database_1.default.prepare('SELECT role FROM participants WHERE chat_id = ? AND user_id = ?')
            .get(chatId, currentUserId);
        if (!participant || (participant.role !== 'owner' && participant.role !== 'admin')) {
            return res.status(403).json({ status: 'error', message: 'Only owner and admin can delete avatar' });
        }
        const chat = database_1.default.prepare('SELECT type, avatar_url FROM chats WHERE id = ?').get(chatId);
        if (!chat || chat.type !== 'group') {
            return res.status(404).json({ status: 'error', message: 'Group not found' });
        }
        if (!chat.avatar_url) {
            return res.status(400).json({ status: 'error', message: 'No avatar to delete' });
        }
        const oldAvatarUrl = chat.avatar_url;
        database_1.default.prepare('UPDATE chats SET avatar_url = NULL WHERE id = ?').run(chatId);
        if (oldAvatarUrl.startsWith('/uploads/group-avatars/')) {
            const oldPath = `.${oldAvatarUrl}`;
            if (fs_1.default.existsSync(oldPath)) {
                fs_1.default.unlinkSync(oldPath);
            }
        }
        (0, broadcast_1.broadcastToChat)(chatId, { type: 'group_avatar_changed', chatId, avatarUrl: null });
        res.json({ status: 'success' });
    }
    catch (error) {
        logger_1.default.error({ error, chatId, currentUserId }, 'Delete group avatar error');
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
};
exports.deleteGroupAvatar = deleteGroupAvatar;
