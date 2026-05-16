"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const migrate_1 = require("../migrate");
(0, migrate_1.registerMigration)('002', 'add_brute_force_protection', (db) => {
    const userInfo = db.prepare("PRAGMA table_info(users)").all();
    if (!userInfo.some(col => col.name === 'failed_attempts')) {
        db.exec("ALTER TABLE users ADD COLUMN failed_attempts INTEGER DEFAULT 0");
        console.log('\x1b[32m[MIGRATION]\x1b[0m Added failed_attempts column');
    }
    if (!userInfo.some(col => col.name === 'locked_until')) {
        db.exec("ALTER TABLE users ADD COLUMN locked_until INTEGER DEFAULT 0");
        console.log('\x1b[32m[MIGRATION]\x1b[0m Added locked_until column');
    }
});
