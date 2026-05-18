// [scaffold] ID: T1.1 | Date: 2026-05-18 | Description: SQLite 连接抽象与单例管理（AA-SEAC §3 约束 4 依赖倒置）
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { logger } = require('../../observability/logger');

/**
 * 解析 DATABASE_URL，目前仅支持 sqlite:./path 与 sqlite::memory:
 * @returns {{ driver: 'sqlite', filename: string }}
 */
function parseDatabaseUrl(url) {
    const value = (url || 'sqlite::memory:').trim();
    if (!value.startsWith('sqlite:')) {
        throw new Error(`仅支持 sqlite:// 协议，收到: ${value}`);
    }
    const filename = value.slice('sqlite:'.length) || ':memory:';
    return { driver: 'sqlite', filename };
}

function ensureDirectory(filename) {
    if (filename === ':memory:') {
        return;
    }
    const dir = path.dirname(path.resolve(filename));
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

let dbInstance = null;

/**
 * 获取（懒加载）数据库连接
 * @param {object} [options]
 * @param {string} [options.url]  覆盖 DATABASE_URL（仅用于测试）
 */
function getDb(options = {}) {
    if (dbInstance) {
        return dbInstance;
    }
    const url = options.url || process.env.DATABASE_URL;
    const { filename } = parseDatabaseUrl(url);
    ensureDirectory(filename);

    const db = new Database(filename, { fileMustExist: false });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    logger.debug({ filename }, 'database connected');
    dbInstance = db;
    return dbInstance;
}

/**
 * 关闭连接（测试用）
 */
function closeDb() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}

module.exports = { getDb, closeDb, parseDatabaseUrl };
