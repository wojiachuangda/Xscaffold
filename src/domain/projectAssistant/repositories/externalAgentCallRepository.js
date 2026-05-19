// [planner] ID: PAM-6 | Date: 2026-05-19 | Description: external_agent_calls 审计日志仓储（async；SQL 仅此文件；不暴露列表 Tool）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../../../infrastructure/database/connection');

function generateId() {
    return `extcall_${crypto.randomBytes(8).toString('hex')}`;
}

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        callId: row.call_id,
        projectId: row.project_id,
        profile: row.profile,
        sessionId: row.session_id,
        instruction: row.instruction,
        expectation: row.expectation ?? null,
        status: row.status,
        reply: row.reply ?? null,
        summary: row.summary ?? null,
        durationMs: row.duration_ms,
        errorMessage: row.error_message ?? null,
        createdAt: row.created_at,
    };
}

async function findById(driver, callId) {
    const { rows } = await driver.query('SELECT * FROM external_agent_calls WHERE call_id = ?', [callId]);
    return rowToEntity(rows[0]);
}

// 凡动必留痕：调用外部服务前先落一条 pending 记录。
async function insertPending(driver, input) {
    const callId = generateId();
    const createdAt = new Date().toISOString();
    await driver.run(
        `INSERT INTO external_agent_calls
         (call_id, project_id, profile, session_id, instruction, expectation, status, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
        [
            callId,
            input.projectId,
            input.profile,
            input.sessionId,
            input.instruction,
            input.expectation ?? null,
            createdAt,
        ],
    );
    return callId;
}

async function markCompleted(driver, callId, result) {
    await driver.run(
        `UPDATE external_agent_calls SET status = 'completed', reply = ?, summary = ?, duration_ms = ?
         WHERE call_id = ?`,
        [result.reply ?? null, result.summary ?? null, result.durationMs ?? 0, callId],
    );
    return findById(driver, callId);
}

// failure: { status: 'failed' | 'timeout', errorMessage, durationMs }（终态）。
async function markFailed(driver, callId, failure) {
    await driver.run(
        `UPDATE external_agent_calls SET status = ?, error_message = ?, duration_ms = ?
         WHERE call_id = ?`,
        [failure.status, failure.errorMessage, failure.durationMs ?? 0, callId],
    );
    return findById(driver, callId);
}

function buildExternalAgentCallRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        insertPending: (input) => insertPending(driver, input),
        markCompleted: (callId, result) => markCompleted(driver, callId, result),
        markFailed: (callId, failure) => markFailed(driver, callId, failure),
        findById: (callId) => findById(driver, callId),
    };
}

module.exports = { buildExternalAgentCallRepository };
