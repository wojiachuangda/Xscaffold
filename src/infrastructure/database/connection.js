// [refactor] ID: V1.5-A.1-S2 | Date: 2026-05-19 | Description: Driver dispatch + 懒加载单例（替换 v1.1 better-sqlite3 直耦合，AA-SEAC §3 约束 4）
'use strict';

const { parseDatabaseUrl, createDriver } = require('./drivers');

let driverInstance = null;

/**
 * 懒加载获取 driver 单例。
 *
 * 兼容 v1.1 调用方式：返回值同时拥有
 *   - 异步 API：`query / run / transaction / close`
 *   - 同步 facade（S2 过渡）：`prepare / execSync / pragma`
 * S7 清除 facade 后只剩 async surface。
 *
 * @param {{ url?: string }} [options] - 仅测试用；运行时使用 process.env.DATABASE_URL
 */
function getDb(options = {}) {
    if (driverInstance) {
        return driverInstance;
    }
    const url = options.url || process.env.DATABASE_URL;
    const config = parseDatabaseUrl(url);
    driverInstance = createDriver(config);
    return driverInstance;
}

/**
 * 测试用：关闭并清空 driver 单例
 */
async function closeDb() {
    if (driverInstance) {
        await driverInstance.close();
        driverInstance = null;
    }
}

/**
 * 测试用：在不关闭的情况下重置单例（用于多 ctx 测试）
 */
function resetDbForTesting() {
    driverInstance = null;
}

module.exports = {
    getDb,
    closeDb,
    parseDatabaseUrl,
    resetDbForTesting,
};
