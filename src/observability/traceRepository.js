// [scaffold] ID: T5.4 | Date: 2026-05-18 | Description: node_traces 表 Repository
'use strict';

const crypto = require('crypto');

const { getDb } = require('../infrastructure/database/connection');

function generateId() {
    return `trace_${crypto.randomBytes(8).toString('hex')}`;
}

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        executionId: row.execution_id,
        nodeId: row.node_id,
        nodeType: row.node_type,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        durationMs: row.duration_ms,
        attempt: row.attempt,
        output: row.output ? JSON.parse(row.output) : null,
        error: row.error ? JSON.parse(row.error) : null,
    };
}

function insertStart(conn, { executionId, nodeId, nodeType, attempt }) {
    const id = generateId();
    const startedAt = new Date().toISOString();
    conn.prepare(
        `INSERT INTO node_traces (id, execution_id, node_id, node_type, status, started_at, attempt)
         VALUES (?, ?, ?, ?, 'RUNNING', ?, ?)`,
    ).run(id, executionId, nodeId, nodeType, startedAt, attempt || 1);
    return id;
}

function finish(conn, id, { status, output, error, durationMs }) {
    const finishedAt = new Date().toISOString();
    conn.prepare(
        `UPDATE node_traces
         SET status = ?, output = ?, error = ?, finished_at = ?, duration_ms = ?
         WHERE id = ?`,
    ).run(
        status,
        output ? JSON.stringify(output) : null,
        error ? JSON.stringify(error) : null,
        finishedAt,
        durationMs ?? null,
        id,
    );
    return findById(conn, id);
}

function findById(conn, id) {
    return rowToEntity(conn.prepare('SELECT * FROM node_traces WHERE id = ?').get(id));
}

function listByExecution(conn, executionId) {
    return conn
        .prepare('SELECT * FROM node_traces WHERE execution_id = ? ORDER BY started_at ASC')
        .all(executionId)
        .map(rowToEntity);
}

function buildTraceRepository(db) {
    const conn = db || getDb();
    return {
        insertStart: (input) => insertStart(conn, input),
        finish: (id, patch) => finish(conn, id, patch),
        findById: (id) => findById(conn, id),
        listByExecution: (executionId) => listByExecution(conn, executionId),
    };
}

module.exports = { buildTraceRepository };
