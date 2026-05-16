"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const migrate_1 = require("../migrate");
(0, migrate_1.registerMigration)('003', 'add_file_support', (db) => {
    const msgInfo = db.prepare("PRAGMA table_info(messages)").all();
    if (!msgInfo.some(col => col.name === 'file_id')) {
        db.exec("ALTER TABLE messages ADD COLUMN file_id TEXT");
        console.log('\x1b[32m[MIGRATION]\x1b[0m Added file_id column to messages');
    }
    db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
    db.exec(`
    CREATE TABLE IF NOT EXISTS encryption_keys (
      user_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
});
