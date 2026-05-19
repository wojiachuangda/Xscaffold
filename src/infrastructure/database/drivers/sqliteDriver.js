// [refactor] ID: V1.5-A.1-S7 | Date: 2026-05-19 | Description: SQLite Driver——better-sqlite3 同步引擎的 async 包装（S2 过渡 facade 已清除）
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SQLITE_UNIQUE_VIOLATION = 'SQLITE_CONSTRAINT_UNIQUE';
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations', 'sqlite');

function ensureDirectory(filename) {
    if (filename === ':memory:') {
        return;
    }
    const dir = path.dirname(path.resolve(filename));
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function isUniqueViolation(err) {
    return Boolean(err) && err.code === SQLITE_UNIQUE_VIOLATION;
}

function buildAsyncSurface(db) {
    return {
        // eslint-disable-next-line require-await
        async query(sql, params = []) {
            const rows = db.prepare(sql).all(...params);
            return { rows };
        },
        // eslint-disable-next-line require-await
        async run(sql, params = []) {
            const r = db.prepare(sql).run(...params);
            return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
        },
        // eslint-disable-next-line require-await
        async exec(sql) {
            db.exec(sql);
        },
        async transaction(fn) {
            db.prepare('BEGIN').run();
            try {
                const result = await fn(buildAsyncSurface(db));
                db.prepare('COMMIT').run();
                return result;
            } catch (err) {
                try {
                    db.prepare('ROLLBACK').run();
                } catch (_) {
                    /* rollback 失败已不可恢复，原错误更重要 */
                }
                throw err;
            }
        },
    };
}

function createSqliteDriver(config) {
    ensureDirectory(config.filename);
    const db = new Database(config.filename, { fileMustExist: false });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const surface = buildAsyncSurface(db);
    return {
        ...surface,
        // eslint-disable-next-line require-await
        async close() {
            db.close();
        },
        migrationsDir: MIGRATIONS_DIR,
        isUniqueViolation,
    };
}

module.exports = {
    createSqliteDriver,
    SQLITE_UNIQUE_VIOLATION,
};
