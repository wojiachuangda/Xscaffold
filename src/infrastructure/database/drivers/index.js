// [refactor] ID: V1.5-A.1-S2 | Date: 2026-05-19 | Description: Driver dispatch——按 DATABASE_URL 协议选择实现
'use strict';

const { DriverConfigSchema } = require('../schemas/driverConfigSchema');
const { createSqliteDriver } = require('./sqliteDriver');

/**
 * 解析 DATABASE_URL 为 driver 配置。
 * 仅识别 `sqlite:<filename>`（A.1）；A.2 引入 `postgres://...`。
 *
 * @param {string|undefined} url
 * @returns {{ driver: 'sqlite', filename: string }}
 */
function parseDatabaseUrl(url) {
    const value = (url || 'sqlite::memory:').trim();
    if (!value.startsWith('sqlite:')) {
        throw new Error(`仅支持 sqlite:// 协议（A.2 引入 PG），收到: ${value}`);
    }
    const filename = value.slice('sqlite:'.length) || ':memory:';
    return DriverConfigSchema.parse({ driver: 'sqlite', filename });
}

/**
 * 工厂：按配置返回 Driver 实例（含 A.1 S2 过渡 facade）
 */
function createDriver(config) {
    if (config.driver === 'sqlite') {
        return createSqliteDriver(config);
    }
    throw new Error(`未实现的 driver: ${config.driver}`);
}

module.exports = {
    parseDatabaseUrl,
    createDriver,
};
