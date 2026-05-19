// [refactor] ID: V1.5-A.1-S7 | Date: 2026-05-19 | Description: 迁移引擎——真异步实现（无 wrapRawDatabase 透传）；入参必须是 Driver
'use strict';

const fs = require('fs');
const path = require('path');

const { getDb } = require('./connection');
const { logger } = require('../../observability/logger');

// 方言中立 DDL：`CURRENT_TIMESTAMP` 是 SQL 标准，SQLite 与 PostgreSQL 都支持，
// 替换 V1.5-A.1 临时使用的 SQLite 专属 `datetime('now')`，使 PG driver 可直接复用此 DDL
const SCHEMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

function assertDriver(driver) {
    if (!driver || typeof driver.query !== 'function' || typeof driver.run !== 'function') {
        throw new Error('migrate: 入参 driver 必须实现 Driver 接口（query/run/exec/transaction）');
    }
}

async function ensureSchemaTable(driver) {
    await driver.exec(SCHEMA_MIGRATIONS_DDL);
}

function listMigrationFiles(dir) {
    if (!fs.existsSync(dir)) {
        return [];
    }
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
}

async function getAppliedIds(driver) {
    const { rows } = await driver.query('SELECT id FROM schema_migrations');
    return new Set(rows.map((r) => r.id));
}

async function applyMigration(driver, dir, file) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await driver.transaction(async (trx) => {
        await trx.exec(sql);
        await trx.run('INSERT INTO schema_migrations (id) VALUES (?)', [file]);
    });
}

async function migrate(options = {}) {
    // 兼容旧字段名 `db`（但其值必须是 Driver，不再接受裸 better-sqlite3）
    const driver = options.driver || options.db || getDb();
    assertDriver(driver);
    await ensureSchemaTable(driver);
    const applied = await getAppliedIds(driver);
    const dir = options.migrationsDir || driver.migrationsDir;
    const files = listMigrationFiles(dir);
    const pending = files.filter((f) => !applied.has(f));

    for (const file of pending) {
        logger.info({ file }, 'applying migration');
        // eslint-disable-next-line no-await-in-loop
        await applyMigration(driver, dir, file);
    }
    return { applied: pending };
}

async function runCli() {
    require('dotenv').config();
    const result = await migrate();
    /* eslint-disable no-console */
    console.warn(`migrations applied: ${result.applied.length}`);
    result.applied.forEach((f) => console.warn(`  + ${f}`));
    /* eslint-enable no-console */
}

if (require.main === module) {
    runCli().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('migration failed:', err);
        process.exit(1);
    });
}

module.exports = { migrate, listMigrationFiles };
