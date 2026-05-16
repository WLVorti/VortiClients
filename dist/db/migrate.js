"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrations = void 0;
exports.registerMigration = registerMigration;
exports.runMigrations = runMigrations;
exports.getMigrationStatus = getMigrationStatus;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.migrations = [];
function registerMigration(id, name, up) {
    exports.migrations.push({ id, name, up });
}
function runMigrations(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);
    const applied = db.prepare('SELECT id FROM migrations ORDER BY id').all();
    const appliedIds = new Set(applied.map(m => m.id));
    const migrationsDir = path_1.default.join(process.cwd(), 'src', 'db', 'migrations');
    if (!fs_1.default.existsSync(migrationsDir)) {
        console.log('\x1b[93m[MIGRATION]\x1b[0m Migrations directory not found');
        return;
    }
    const migrationFiles = fs_1.default.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.ts') && /^m\d+_/.test(f))
        .sort();
    for (const file of migrationFiles) {
        const id = file.match(/^m(\d+)_/)?.[1] || '';
        if (!appliedIds.has(id)) {
            console.log(`\x1b[36m[MIGRATION]\x1b[0m Running migration: ${file}`);
            const migration = require(path_1.default.join(migrationsDir, file));
            if (migration && typeof migration.up === 'function') {
                migration.up(db);
            }
            db.prepare('INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)')
                .run(id, file.replace('.ts', ''), Date.now());
            console.log(`\x1b[32m[MIGRATION]\x1b[0m Applied: ${file}`);
        }
    }
}
function getMigrationStatus(db) {
    const applied = db.prepare('SELECT * FROM migrations ORDER BY id').all();
    const total = exports.migrations.length;
    return { applied: applied, total };
}
