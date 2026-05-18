// [scaffold] ID: T5.3 | Date: 2026-05-18 | Description: 审计降级通道——契约校验失败仍强写原始 payload（AA-SEAC §4.3）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../../infrastructure/database/connection');

function buildAuditRepository(db) {
    const conn = db || getDb();

    function recordDeadLetter({ source, reason, payload }) {
        const id = `audit_${crypto.randomBytes(8).toString('hex')}`;
        conn.prepare(
            `INSERT INTO audit_dead_letters (id, source, reason, payload)
             VALUES (?, ?, ?, ?)`,
        ).run(id, source, reason, safeStringify(payload));
        return { id };
    }

    function listRecent(source, limit = 50) {
        return conn
            .prepare('SELECT * FROM audit_dead_letters WHERE source = ? ORDER BY created_at DESC LIMIT ?')
            .all(source, limit);
    }

    return { recordDeadLetter, listRecent };
}

function safeStringify(payload) {
    try {
        return JSON.stringify(payload);
    } catch {
        return String(payload);
    }
}

module.exports = { buildAuditRepository };
