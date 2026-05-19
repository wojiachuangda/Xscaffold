// [refactor] ID: V1.5-A.2 | Date: 2026-05-19 | Description: Driver dispatch——按 DATABASE_URL 协议选择 sqlite 或 postgres 实现
'use strict';

const { DriverConfigSchema } = require('../schemas/driverConfigSchema');
const { createSqliteDriver } = require('./sqliteDriver');
const { createPgDriver } = require('./pgDriver');

const PG_PROTOCOLS = ['postgres:', 'postgresql:'];
const SQLITE_PROTOCOL = 'sqlite:';

/**
 * 解析 DATABASE_URL 为 driver 配置。
 *
 * 支持协议：
 *   - `sqlite:<filename>`（含 `sqlite::memory:`）
 *   - `postgres://...` / `postgresql://...`（A.2 引入）
 *
 * 优先级：postgres > sqlite。空 URL fallback 至 `sqlite::memory:`（兼容测试默认）。
 *
 * @param {string|undefined} url
 * @returns {import('zod').infer<typeof DriverConfigSchema>}
 */
function parseDatabaseUrl(url) {
    const value = (url || 'sqlite::memory:').trim();

    if (PG_PROTOCOLS.some((p) => value.startsWith(p))) {
        return DriverConfigSchema.parse({
            driver: 'postgres',
            connectionString: value,
            ...readPgPoolMaxFromEnv(),
        });
    }

    if (value.startsWith(SQLITE_PROTOCOL)) {
        const filename = value.slice(SQLITE_PROTOCOL.length) || ':memory:';
        return DriverConfigSchema.parse({ driver: 'sqlite', filename });
    }

    throw new Error(`不支持的 DATABASE_URL 协议（仅 sqlite:/postgres:/postgresql:），收到: ${value}`);
}

/**
 * 从环境变量读 PG_POOL_MAX（可选）。
 * 单独抽函数避免在 schema parse 时引用 process.env，便于测试 stub。
 */
function readPgPoolMaxFromEnv() {
    const raw = process.env.PG_POOL_MAX;
    if (!raw) {
        return {};
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
        return {};
    }
    return { poolMax: Math.floor(n) };
}

/**
 * 工厂：按配置返回 Driver 实例。
 */
function createDriver(config) {
    if (config.driver === 'sqlite') {
        return createSqliteDriver(config);
    }
    if (config.driver === 'postgres') {
        return createPgDriver(config);
    }
    throw new Error(`未实现的 driver: ${config.driver}`);
}

module.exports = {
    parseDatabaseUrl,
    createDriver,
};
