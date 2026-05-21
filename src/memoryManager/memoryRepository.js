// [refactor] ID: V1.5-A.1-S4 | Date: 2026-05-19 | Description: messages 表 Repository（async 契约；SQL 仅在此文件）
'use strict';

const crypto = require('crypto');

const { MessageRoleSchema } = require('./memorySchema');
const { getDb } = require('../infrastructure/database/connection');
const { ValidationError } = require('../infrastructure/errors/AppError');

// 与 agentRepository 一致：内部调用（workflow 节点）缺省 ownerId 时落到 dev 默认用户，不参与隔离
const DEFAULT_OWNER_ID = 'user_dev_default';

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        sessionId: row.session_id,
        tenantId: row.tenant_id ?? null,
        ownerId: row.owner_id ?? null,
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
        `INSERT INTO messages (id, session_id, tenant_id, owner_id, role, content, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            input.sessionId,
            input.tenantId ?? null,
            input.ownerId ?? DEFAULT_OWNER_ID,
            input.role,
            input.content,
            input.metadata ? JSON.stringify(input.metadata) : null,
            createdAt,
        ],
    );
    return findById(driver, id);
}

// ownerId 传入则按归属过滤（纵深防御）；不传维持 session-only，workflow 路径行为不变
async function listRecent(driver, sessionId, limit, ownerId) {
    const sql = ownerId
        ? 'SELECT * FROM messages WHERE session_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT ?'
        : 'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?';
    const params = ownerId ? [sessionId, ownerId, limit] : [sessionId, limit];
    const { rows } = await driver.query(sql, params);
    return rows.reverse().map(rowToEntity);
}

// 取该 session 任一行的 owner_id 判归属；无消息返 null（新 session 可认领）。走 session 索引，非全表
async function findSessionOwner(driver, sessionId) {
    const { rows } = await driver.query(
        'SELECT owner_id FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 1',
        [sessionId],
    );
    return rows[0] ? (rows[0].owner_id ?? null) : null;
}

// 统计 session 消息总数（owner 可选过滤）；走 session 索引，供截断「丢弃 N 条」精确计数
async function countBySession(driver, sessionId, ownerId) {
    const sql = ownerId
        ? 'SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND owner_id = ?'
        : 'SELECT COUNT(*) AS n FROM messages WHERE session_id = ?';
    const params = ownerId ? [sessionId, ownerId] : [sessionId];
    const { rows } = await driver.query(sql, params);
    return Number(rows[0]?.n ?? 0);
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
        listRecent: (sessionId, limit, ownerId) => listRecent(driver, sessionId, limit, ownerId),
        findSessionOwner: (sessionId) => findSessionOwner(driver, sessionId),
        countBySession: (sessionId, ownerId) => countBySession(driver, sessionId, ownerId),
        deleteSession: (sessionId) => deleteSession(driver, sessionId),
    };
}

module.exports = { buildMemoryRepository };
