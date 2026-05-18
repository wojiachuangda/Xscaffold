// [scaffold] ID: T5.1 | Date: 2026-05-18 | Description: messages 表 Repository（SQL 仅在此文件）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../infrastructure/database/connection');

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

function insertMessage(conn, input) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    conn.prepare(
        `INSERT INTO messages (id, session_id, tenant_id, role, content, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id,
        input.sessionId,
        input.tenantId ?? null,
        input.role,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
        createdAt,
    );
    return findById(conn, id);
}

function findById(conn, id) {
    return rowToEntity(conn.prepare('SELECT * FROM messages WHERE id = ?').get(id));
}

function listRecent(conn, sessionId, limit) {
    const rows = conn
        .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(sessionId, limit);
    return rows.reverse().map(rowToEntity);
}

function deleteSession(conn, sessionId) {
    const r = conn.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
    return r.changes;
}

function buildMemoryRepository(db) {
    const conn = db || getDb();
    return {
        insert: (input) => insertMessage(conn, input),
        findById: (id) => findById(conn, id),
        listRecent: (sessionId, limit) => listRecent(conn, sessionId, limit),
        deleteSession: (sessionId) => deleteSession(conn, sessionId),
    };
}

module.exports = { buildMemoryRepository };
