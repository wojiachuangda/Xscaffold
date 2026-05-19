// [refactor] ID: V1.5-A.1-S4 | Date: 2026-05-19 | Description: messages 表 Repository（async 契约；SQL 仅在此文件）
'use strict';

const crypto = require('crypto');

const { MessageRoleSchema } = require('./memorySchema');
const { getDb } = require('../infrastructure/database/connection');
const { ValidationError } = require('../infrastructure/errors/AppError');

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        sessionId: row.session_id,
        tenantId: row.tenant_id ?? null,
        role: row.role,
        content: row.content,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        createdAt: row.created_at,
    };
}

function generateId() {
    return `msg_${crypto.randomBytes(8).toString('hex')}`;
}

function assertValidRole(role) {
    const parsed = MessageRoleSchema.safeParse(role);
    if (!parsed.success) {
        throw new ValidationError('Message role 不合法', [
            { path: 'role', code: 'invalid_enum_value', message: 'role must be system/user/assistant/tool' },
        ]);
    }
}

async function findById(driver, id) {
    const { rows } = await driver.query('SELECT * FROM messages WHERE id = ?', [id]);
    return rowToEntity(rows[0]);
}

async function insertMessage(driver, input) {
    assertValidRole(input.role);
    const id = generateId();
    const createdAt = new Date().toISOString();
    await driver.run(
        `INSERT INTO messages (id, session_id, tenant_id, role, content, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            input.sessionId,
            input.tenantId ?? null,
            input.role,
            input.content,
            input.metadata ? JSON.stringify(input.metadata) : null,
            createdAt,
        ],
    );
    return findById(driver, id);
}

async function listRecent(driver, sessionId, limit) {
    const { rows } = await driver.query(
        'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
        [sessionId, limit],
    );
    return rows.reverse().map(rowToEntity);
}

async function deleteSession(driver, sessionId) {
    const r = await driver.run('DELETE FROM messages WHERE session_id = ?', [sessionId]);
    return r.changes;
}

function buildMemoryRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        insert: (input) => insertMessage(driver, input),
        findById: (id) => findById(driver, id),
        listRecent: (sessionId, limit) => listRecent(driver, sessionId, limit),
        deleteSession: (sessionId) => deleteSession(driver, sessionId),
    };
}

module.exports = { buildMemoryRepository };
