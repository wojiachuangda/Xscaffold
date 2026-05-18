// [scaffold] ID: T4.3 | Date: 2026-05-18 | Description: 工作流执行记录持久化（Repository 模式，SQL 仅出现此文件）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../infrastructure/database/connection');
const { NotFoundError } = require('../infrastructure/errors/AppError');

function generateId() {
    return `exec_${crypto.randomBytes(8).toString('hex')}`;
}

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        workflowId: row.workflow_id,
        status: row.status,
        input: row.input ? JSON.parse(row.input) : null,
        result: row.result ? JSON.parse(row.result) : null,
        error: row.error ? JSON.parse(row.error) : null,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: row.duration_ms,
    };
}

function buildExecutionStore(db) {
    const conn = db || getDb();

    function create({ workflowId, input }) {
        const id = generateId();
        const startedAt = new Date().toISOString();
        conn.prepare(
            `INSERT INTO executions (id, workflow_id, status, input, started_at)
             VALUES (?, ?, 'PENDING', ?, ?)`,
        ).run(id, workflowId, input ? JSON.stringify(input) : null, startedAt);
        return findById(id);
    }

    function findById(id) {
        return rowToEntity(conn.prepare('SELECT * FROM executions WHERE id = ?').get(id));
    }

    function requireById(id) {
        const r = findById(id);
        if (!r) {
            throw new NotFoundError(`执行记录不存在: ${id}`);
        }
        return r;
    }

    function markFinal(id, { status, result, error, durationMs }) {
        const finishedAt = new Date().toISOString();
        conn.prepare(
            `UPDATE executions
             SET status = ?, result = ?, error = ?, finished_at = ?, duration_ms = ?
             WHERE id = ?`,
        ).run(
            status,
            result ? JSON.stringify(result) : null,
            error ? JSON.stringify(error) : null,
            finishedAt,
            durationMs ?? null,
            id,
        );
        return findById(id);
    }

    function markRunning(id) {
        conn.prepare("UPDATE executions SET status = 'RUNNING' WHERE id = ?").run(id);
    }

    return { create, findById, requireById, markFinal, markRunning };
}

module.exports = { buildExecutionStore };
