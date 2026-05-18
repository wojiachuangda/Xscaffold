// [scaffold] ID: T1.1 | Date: 2026-05-18 | Description: 简化迁移引擎——顺序执行 migrations/*.sql，落表 schema_migrations
'use strict';

const fs = require('fs');
const path = require('path');

const { getDb } = require('./connection');
const { logger } = require('../../observability/logger');

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

function ensureSchemaTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `);
}

function listMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        return [];
    }
    return fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();
}

function getAppliedIds(db) {
    return new Set(
        db
            .prepare('SELECT id FROM schema_migrations')
            .all()
            .map((r) => r.id),
    );
}

function applyMigration(db, file) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const tx = db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(file);
    });
    tx();
}

function migrate(options = {}) {
    const db = options.db || getDb();
    ensureSchemaTable(db);
    const applied = getAppliedIds(db);
    const files = listMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    for (const file of pending) {
        logger.info({ file }, 'applying migration');
        applyMigration(db, file);
    }
    return { applied: pending };
}

if (require.main === module) {
    require('dotenv').config();
    const result = migrate();
    /* eslint-disable no-console */
    console.log(`migrations applied: ${result.applied.length}`);
    result.applied.forEach((f) => console.log(`  + ${f}`));
    /* eslint-enable no-console */
}

module.exports = { migrate, listMigrationFiles, MIGRATIONS_DIR };
