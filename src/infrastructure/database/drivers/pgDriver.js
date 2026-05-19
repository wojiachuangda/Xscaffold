// [refactor] ID: V1.5-A.2 | Date: 2026-05-19 | Description: PostgreSQL Driver——node-postgres 的 Driver 接口实现（占位符重写、JSONB 文本归一、async 事务）
'use strict';

const path = require('path');

const { logger } = require('../../../observability/logger');

const PG_UNIQUE_VIOLATION = '23505';
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations', 'pg');

// pg 类型 OID 常量（来自 PostgreSQL 系统目录，跨版本稳定）
const OID_JSON = 114;
const OID_JSONB = 3802;

let pgLibCache = null;

/**
 * 懒加载 pg 库并配置 JSON/JSONB type parser 为「返回原始文本」。
 *
 * 关键设计：覆盖默认 parser 后，pg.query 返回的 JSONB 列值仍是 string，
 * 与 SQLite 的 TEXT 列保持二进制级别一致 →
 * Repository 层 `JSON.parse(row.x)` 对两种 driver 完全通用，零分支。
 */
function loadPg() {
    if (pgLibCache) {
        return pgLibCache;
    }
    // eslint-disable-next-line global-require
    const pg = require('pg');
    pg.types.setTypeParser(OID_JSON, (val) => val);
    pg.types.setTypeParser(OID_JSONB, (val) => val);
    pgLibCache = pg;
    return pg;
}

/**
 * 把 SQL 中的 `?` 占位符按出现顺序重写为 `$1, $2, ...`。
 *
 * 适用前提：本仓库所有 SQL 均为参数化语句，字符串字面量不含 `?`。
 * 见 PLAN_V1.5-A.2 §3 D-A2-6。
 *
 * @param {string} sql
 * @returns {string}
 */
function rewritePlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => {
        i += 1;
        return `$${i}`;
    });
}

/**
 * 归一化错误识别：PG 错误码 `23505` 表示 unique_violation。
 */
function isUniqueViolation(err) {
    return Boolean(err) && err.code === PG_UNIQUE_VIOLATION;
}

/**
 * 在给定 executor（Pool 或 PoolClient）上构造 async Driver surface。
 *
 * @param {{ query: Function }} executor pg.Pool 或 pg.PoolClient
 */
function buildSurface(executor) {
    return {
        async query(sql, params = []) {
            const result = await executor.query(rewritePlaceholders(sql), params);
            return { rows: result.rows };
        },
        async run(sql, params = []) {
            const result = await executor.query(rewritePlaceholders(sql), params);
            return { changes: result.rowCount || 0, lastInsertRowid: undefined };
        },
        async exec(sql) {
            // simple query 路径支持多语句（前提：无参数）。迁移 SQL 走此分支。
            await executor.query(sql);
        },
    };
}

async function runTransaction(pool, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const trxSurface = {
            ...buildSurface(client),
            transaction: () => {
                throw new Error('嵌套事务暂不支持');
            },
        };
        const result = await fn(trxSurface);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            logger.warn({ err: rollbackErr }, 'pg rollback failed; 原错误更重要');
        }
        throw err;
    } finally {
        client.release();
    }
}

/**
 * 创建 PG Driver 实例。
 *
 * @param {{ driver: 'postgres', connectionString: string, poolMax?: number }} config
 * @returns {import('./driverInterface').Driver}
 */
function createPgDriver(config) {
    const pg = loadPg();
    const pool = new pg.Pool({
        connectionString: config.connectionString,
        max: config.poolMax || 10,
    });
    const surface = buildSurface(pool);
    return {
        ...surface,
        transaction(fn) {
            return runTransaction(pool, fn);
        },
        async close() {
            await pool.end();
        },
        migrationsDir: MIGRATIONS_DIR,
        isUniqueViolation,
    };
}

module.exports = {
    createPgDriver,
    rewritePlaceholders,
    isUniqueViolation,
    PG_UNIQUE_VIOLATION,
};
