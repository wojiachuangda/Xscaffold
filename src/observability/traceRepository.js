// [refactor] ID: V1.5-A.1-S4 | Date: 2026-05-19 | Description: node_traces 表 Repository（async 契约）
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

async function findById(driver, id) {
    const { rows } = await driver.query('SELECT * FROM node_traces WHERE id = ?', [id]);
    return rowToEntity(rows[0]);
}

async function insertStart(driver, { executionId, nodeId, nodeType, attempt }) {
    const id = generateId();
    const startedAt = new Date().toISOString();
    await driver.run(
        `INSERT INTO node_traces (id, execution_id, node_id, node_type, status, started_at, attempt)
         VALUES (?, ?, ?, ?, 'RUNNING', ?, ?)`,
        [id, executionId, nodeId, nodeType, startedAt, attempt || 1],
    );
    return id;
}

async function finish(driver, id, { status, output, error, durationMs }) {
    const finishedAt = new Date().toISOString();
    await driver.run(
        `UPDATE node_traces
         SET status = ?, output = ?, error = ?, finished_at = ?, duration_ms = ?
         WHERE id = ?`,
        [
            status,
            output ? JSON.stringify(output) : null,
            error ? JSON.stringify(error) : null,
            finishedAt,
            durationMs ?? null,
            id,
        ],
    );
    return findById(driver, id);
}

async function listByExecution(driver, executionId) {
    const { rows } = await driver.query('SELECT * FROM node_traces WHERE execution_id = ? ORDER BY started_at ASC', [
        executionId,
    ]);
    return rows.map(rowToEntity);
}

function buildTraceRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        insertStart: (input) => insertStart(driver, input),
        finish: (id, patch) => finish(driver, id, patch),
        findById: (id) => findById(driver, id),
        listByExecution: (executionId) => listByExecution(driver, executionId),
    };
}

module.exports = { buildTraceRepository };
