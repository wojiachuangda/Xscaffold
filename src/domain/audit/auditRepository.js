// [refactor] ID: V1.5-A.1-S4 | Date: 2026-05-19 | Description: 审计降级通道——契约校验失败仍强写原始 payload（async 契约；AA-SEAC §4.3）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../../infrastructure/database/connection');

function safeStringify(payload) {
    try {
        return JSON.stringify(payload);
    } catch {
        return String(payload);
    }
}

function buildAuditRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();

    async function recordDeadLetter({ source, reason, payload }) {
        const id = `audit_${crypto.randomBytes(8).toString('hex')}`;
        await driver.run(
            `INSERT INTO audit_dead_letters (id, source, reason, payload)
             VALUES (?, ?, ?, ?)`,
            [id, source, reason, safeStringify(payload)],
        );
        return { id };
    }

    async function listRecent(source, limit = 50) {
        const { rows } = await driver.query(
            'SELECT * FROM audit_dead_letters WHERE source = ? ORDER BY created_at DESC LIMIT ?',
            [source, limit],
        );
        return rows;
    }

    return { recordDeadLetter, listRecent };
}

module.exports = { buildAuditRepository };
