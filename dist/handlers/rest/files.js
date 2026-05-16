"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileInfo = exports.downloadFile = exports.uploadFile = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const fs_1 = __importDefault(require("fs"));
const database_1 = __importDefault(require("../../db/database"));
const UPLOADS_DIR = path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(UPLOADS_DIR)) {
    fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const filename = `${(0, uuid_1.v4)()}${ext}`;
        cb(null, filename);
    }
});
const fileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
        'video/mp4', 'video/webm',
        'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('File type not allowed'));
    }
};
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});
function canAccessFile(userId, fileId) {
    const file = database_1.default.prepare('SELECT uploaded_by FROM files WHERE id = ?').get(fileId);
    if (!file)
        return false;
    if (file.uploaded_by === userId)
        return true;
    const hasAccess = database_1.default.prepare(`
    SELECT 1 FROM messages m
    JOIN participants p ON m.chat_id = p.chat_id
    WHERE m.file_id = ? AND p.user_id = ?
    LIMIT 1
  `).get(fileId, userId);
    return !!hasAccess;
}
const uploadFile = async (req, res) => {
    const userId = req.userId;
    const file = req.file;
    if (!file) {
        return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }
    try {
        const fileId = (0, uuid_1.v4)();
        const fileName = file.originalname;
        const fileType = file.mimetype;
        const fileSize = file.size;
        const storedFilename = file.filename;
        database_1.default.prepare(`
      INSERT INTO files (id, filename, original_name, mime_type, size, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, storedFilename, fileName, fileType, fileSize, userId, Date.now());
        res.json({
            status: 'success',
            fileId,
            filename: fileName,
            mimeType: fileType,
            size: fileSize
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ status: 'error', message: 'Upload failed' });
    }
};
exports.uploadFile = uploadFile;
const downloadFile = async (req, res) => {
    const fileId = req.params.fileId;
    const userId = req.userId;
    try {
        const file = database_1.default.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
        if (!file) {
            return res.status(404).json({ status: 'error', message: 'File not found' });
        }
        if (!canAccessFile(userId, fileId)) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }
        const filePath = path_1.default.join(UPLOADS_DIR, file.filename);
        if (!fs_1.default.existsSync(filePath)) {
            return res.status(404).json({ status: 'error', message: 'File not found on disk' });
        }
        res.setHeader('Content-Type', file.mime_type);
        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.sendFile(filePath);
    }
    catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ status: 'error', message: 'Download failed' });
    }
};
exports.downloadFile = downloadFile;
const getFileInfo = async (req, res) => {
    const fileId = req.params.fileId;
    const userId = req.userId;
    try {
        const file = database_1.default.prepare(`
      SELECT f.id, f.filename, f.original_name, f.mime_type, f.size, f.created_at, u.username as uploaded_by
      FROM files f
      JOIN users u ON f.uploaded_by = u.id
      WHERE f.id = ?
    `).get(fileId);
        if (!file) {
            return res.status(404).json({ status: 'error', message: 'File not found' });
        }
        if (!canAccessFile(userId, fileId)) {
            return res.status(403).json({ status: 'error', message: 'Access denied' });
        }
        res.json({
            status: 'success',
            file: {
                id: file.id,
                filename: file.original_name,
                mimeType: file.mime_type,
                size: file.size,
                uploadedBy: file.uploaded_by,
                createdAt: file.created_at
            }
        });
    }
    catch (error) {
        console.error('Get file info error:', error);
        res.status(500).json({ status: 'error', message: 'Download failed' });
    }
};
exports.getFileInfo = getFileInfo;
