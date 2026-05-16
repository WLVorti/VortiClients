"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConnection = createConnection;
exports.initDatabase = initDatabase;
exports.tryReconnect = tryReconnect;
exports.closeDatabase = closeDatabase;
require("dotenv/config");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const dbPath = path_1.default.join(process.cwd(), 'messenger.db');
let db;
let isClosing = false;
function createConnection() {
    const database = new better_sqlite3_1.default(dbPath);
    database.pragma('foreign_keys = ON');
    database.pragma('journal_mode = WAL');
    return database;
}
function initDatabase() {
    try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS migrations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at INTEGER NOT NULL
          )
        `);
        const applied = db.prepare('SELECT id FROM migrations').all();
        const appliedIds = new Set(applied.map(m => m.id));
        const migrations = [
            {
                id: '001',
                name: 'initial_schema',
                sql: `
                    CREATE TABLE IF NOT EXISTS users (
                        id TEXT PRIMARY KEY,
                        username TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        failed_attempts INTEGER DEFAULT 0,
                        locked_until INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS chats (
                        id TEXT PRIMARY KEY,
                        name TEXT,
                        type TEXT NOT NULL,
                        created_at INTEGER NOT NULL
                    );
                    CREATE TABLE IF NOT EXISTS participants (
                        chat_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        joined_at INTEGER NOT NULL,
                        PRIMARY KEY (chat_id, user_id),
                        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE TABLE IF NOT EXISTS messages (
                        id TEXT PRIMARY KEY,
                        chat_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        text TEXT NOT NULL,
                        reply_to TEXT,
                        file_id TEXT,
                        file_mime_type TEXT,
                        created_at INTEGER NOT NULL,
                        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                        FOREIGN KEY (reply_to) REFERENCES messages(id) ON DELETE SET NULL
                    );
                    CREATE TABLE IF NOT EXISTS read_receipts (
                        message_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        read_at INTEGER NOT NULL,
                        PRIMARY KEY (message_id, user_id),
                        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE TABLE IF NOT EXISTS files (
                        id TEXT PRIMARY KEY,
                        filename TEXT NOT NULL,
                        original_name TEXT NOT NULL,
                        mime_type TEXT NOT NULL,
                        size INTEGER NOT NULL,
                        uploaded_by TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE TABLE IF NOT EXISTS encryption_keys (
                        user_id TEXT PRIMARY KEY,
                        public_key TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages(chat_id, created_at);
                    CREATE INDEX IF NOT EXISTS idx_participants_user ON participants(user_id);
                `
            },
            {
                id: '004',
                name: 'add_delivery_receipts',
                sql: `
                    CREATE TABLE IF NOT EXISTS delivery_receipts (
                        message_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        delivered_at INTEGER NOT NULL,
                        PRIMARY KEY (message_id, user_id),
                        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                `
            },
            {
                id: '005',
                name: 'add_drafts',
                sql: `
                    CREATE TABLE IF NOT EXISTS drafts (
                        user_id TEXT NOT NULL,
                        chat_id TEXT NOT NULL,
                        text TEXT NOT NULL,
                        updated_at INTEGER NOT NULL,
                        PRIMARY KEY (user_id, chat_id),
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_drafts_user_chat ON drafts(user_id, chat_id);
                `
            },
            {
                id: '006',
                name: 'add_user_profile',
                sql: `
                    ALTER TABLE users ADD COLUMN bio TEXT DEFAULT '';
                    ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT '';
                    ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT '';
                    ALTER TABLE users ADD COLUMN updated_at INTEGER DEFAULT 0;
                `
            },
            {
                id: '007',
                name: 'add_push_tokens',
                sql: `
                    CREATE TABLE IF NOT EXISTS push_tokens (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        token TEXT NOT NULL,
                        platform TEXT NOT NULL,
                        device_name TEXT DEFAULT '',
                        created_at INTEGER NOT NULL,
                        last_active INTEGER NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);
                    CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);
                `
            },
            {
                id: '008',
                name: 'add_messages_file_mime_type',
                sql: `ALTER TABLE messages ADD COLUMN file_mime_type TEXT DEFAULT NULL;`
            },
            {
                id: '009',
                name: 'add_participants_role',
                sql: `ALTER TABLE participants ADD COLUMN role TEXT DEFAULT 'member';`
            },
            {
                id: '010',
                name: 'add_chats_avatar_url',
                sql: `ALTER TABLE chats ADD COLUMN avatar_url TEXT DEFAULT NULL;`
            },
            {
                id: '011',
                name: 'create_calls_table',
                sql: `
                    CREATE TABLE IF NOT EXISTS calls (
                        id TEXT PRIMARY KEY,
                        chat_id TEXT NOT NULL,
                        caller_id TEXT NOT NULL,
                        call_type TEXT DEFAULT 'video',
                        status TEXT DEFAULT 'ringing',
                        started_at INTEGER NOT NULL,
                        ended_at INTEGER,
                        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                        FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                `
            },
            {
                id: '012',
                name: 'Create muted_chats table',
                sql: `
                    CREATE TABLE IF NOT EXISTS muted_chats (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        chat_id TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
                        UNIQUE(user_id, chat_id)
                    );
                `
            }
        ];
        for (const migration of migrations) {
            if (!appliedIds.has(migration.id)) {
                console.log(`\x1b[36m[MIGRATION]\x1b[0m Running migration: ${migration.name}`);
                db.exec(migration.sql);
                db.prepare('INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)')
                    .run(migration.id, migration.name, Date.now());
                console.log(`\x1b[32m[MIGRATION]\x1b[0m Applied: ${migration.name}`);
            }
        }
        console.log('Database connected successfully.');
    }
    catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
}
function tryReconnect() {
    if (isClosing)
        return;
    console.log('\x1b[93m[WARNING]\x1b[0m Database connection lost. Attempting to reconnect...');
    try {
        db.close();
    }
    catch { /* ignore */ }
    let attempts = 0;
    const maxAttempts = 10;
    const reconnectInterval = setInterval(() => {
        if (isClosing) {
            clearInterval(reconnectInterval);
            return;
        }
        attempts++;
        try {
            db = createConnection();
            initDatabase();
            clearInterval(reconnectInterval);
            console.log('\x1b[92m[SUCCESS]\x1b[0m Database reconnected successfully.');
        }
        catch {
            if (attempts >= maxAttempts) {
                clearInterval(reconnectInterval);
                console.error('\x1b[91m[FATAL]\x1b[0m Failed to reconnect after 10 attempts.');
                process.exit(1);
            }
            console.log(`\x1b[93m[WARNING]\x1b[0m Reconnection attempt ${attempts}/${maxAttempts} failed. Retrying in 5s...`);
        }
    }, 5000);
}
db = createConnection();
initDatabase();
process.on('uncaughtException', (err) => {
    if (err.message.includes('SQLITE_') || err.message.includes('database')) {
        console.error('\x1b[91m[ERROR]\x1b[0m Database error:', err.message);
        tryReconnect();
    }
    else {
        throw err;
    }
});
function closeDatabase() {
    isClosing = true;
    console.log('Closing database connection...');
    try {
        db.close();
    }
    catch { /* ignore */ }
}
exports.default = db;
