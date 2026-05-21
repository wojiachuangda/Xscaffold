// [refactor] ID: V2.5-MT | Date: 2026-05-21 | Description: ApiKey 数据访问层（async 契约；SQL 仅此文件；只存哈希）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../infrastructure/database/connection');
const { ConflictError } = require('../infrastructure/errors/AppError');

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        userId: row.user_id,
        keyHash: row.key_hash,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
    };
}

function generateId() {
    return `key_${crypto.randomBytes(8).toString('hex')}`;
}

async function findActiveByHash(driver, keyHash) {
    const { rows } = await driver.query("SELECT * FROM api_keys WHERE key_hash = ? AND status = 'active'", [keyHash]);
    return rowToEntity(rows[0]);
}

async function create(driver, { userId, name, keyHash }) {
    const id = generateId();
    try {
        await driver.run('INSERT INTO api_keys (id, user_id, key_hash, name, status) VALUES (?, ?, ?, ?, ?)', [
            id,
            userId,
            keyHash,
            name,
            'active',
        ]);
    } catch (err) {
        if (driver.isUniqueViolation(err)) {
            throw new ConflictError('API key 哈希冲突');
        }
        throw err;
    }
    return findActiveByHash(driver, keyHash);
}

function buildApiKeyRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        findActiveByHash: (keyHash) => findActiveByHash(driver, keyHash),
        create: (input) => create(driver, input),
    };
}

module.exports = { buildApiKeyRepository };
