"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const migrate_1 = require("../migrate");
(0, migrate_1.registerMigration)('004', 'add_delivery_receipts', (db) => {
    db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_receipts (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      delivered_at INTEGER NOT NULL,
      PRIMARY KEY (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
});
