// [refactor] ID: V1.5-A.1-S4 | Date: 2026-05-19 | Description: 工作流执行记录持久化（async Repository；SQL 仅出现此文件）
'use strict';

const crypto = require('crypto');

const { ExecutionStatusSchema } = require('./executionSchema');
const { getDb } = require('../infrastructure/database/connection');
const { NotFoundError, ValidationError } = require('../infrastructure/errors/AppError');

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

function assertValidStatus(status) {
    const parsed = ExecutionStatusSchema.safeParse(status);
    if (!parsed.success) {
        throw new ValidationError('Execution status 不合法', [
            {
                path: 'status',
                code: 'invalid_enum_value',
                message: 'status must be PENDING/RUNNING/SUCCESS/FAILED/STUCK/TIMEOUT',
            },
        ]);
    }
}

async function listExecutions(driver, filters = {}) {
    const normalized = normalizeListFilters(filters);
    const { whereSql, params } = buildListWhere(normalized);
    const countResult = await driver.query(`SELECT COUNT(*) AS total FROM executions${whereSql}`, params);
    const pageResult = await driver.query(
        `SELECT * FROM executions${whereSql} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
        [...params, normalized.limit, normalized.offset],
    );
    return {
        items: pageResult.rows.map(rowToEntity),
        total: Number(countResult.rows[0]?.total || 0),
    };
}

function buildExecutionStore(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();

    async function findById(id) {
        const { rows } = await driver.query('SELECT * FROM executions WHERE id = ?', [id]);
        return rowToEntity(rows[0]);
    }

    async function create({ workflowId, input }) {
        const id = generateId();
        const startedAt = new Date().toISOString();
        await driver.run(
            `INSERT INTO executions (id, workflow_id, status, input, started_at)
             VALUES (?, ?, 'PENDING', ?, ?)`,
            [id, workflowId, input ? JSON.stringify(input) : null, startedAt],
        );
        return findById(id);
    }

    async function requireById(id) {
        const r = await findById(id);
        if (!r) {
            throw new NotFoundError(`执行记录不存在: ${id}`);
        }
        return r;
    }

    async function markFinal(id, { status, result, error, durationMs }) {
        assertValidStatus(status);
        const finishedAt = new Date().toISOString();
        await driver.run(
            `UPDATE executions
             SET status = ?, result = ?, error = ?, finished_at = ?, duration_ms = ?
             WHERE id = ?`,
            [
                status,
                result ? JSON.stringify(result) : null,
                error ? JSON.stringify(error) : null,
                finishedAt,
                durationMs ?? null,
                id,
            ],
        );
        return findById(id);
    }

    async function markRunning(id) {
        await driver.run("UPDATE executions SET status = 'RUNNING' WHERE id = ?", [id]);
    }

    const list = (filters) => listExecutions(driver, filters);
    return { create, findById, list, requireById, markFinal, markRunning };
}

function normalizeListFilters(filters) {
    return {
        workflowId: filters.workflowId,
        status: filters.status,
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
    };
}

function buildListWhere(filters) {
    const clauses = [];
    const params = [];
    if (filters.workflowId) {
        clauses.push('workflow_id = ?');
        params.push(filters.workflowId);
    }
    if (filters.status) {
        clauses.push('status = ?');
        params.push(filters.status);
    }
    return {
        whereSql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
        params,
    };
}

module.exports = { buildExecutionStore };
