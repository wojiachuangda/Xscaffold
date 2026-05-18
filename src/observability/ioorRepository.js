// [scaffold] ID: T5.3 | Date: 2026-05-18 | Description: IOOR 记录存储（SQL 仅在此文件）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../infrastructure/database/connection');

function generateId() {
    return `ioor_${crypto.randomBytes(8).toString('hex')}`;
}

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        executionId: row.execution_id,
        nodeId: row.node_id,
        turnIndex: row.turn_index,
        agentId: row.agent_id,
        profileHash: row.profile_hash,
        modelProvider: row.model_provider,
        modelName: row.model_name,
        input: row.input ? JSON.parse(row.input) : null,
        output: row.output ? JSON.parse(row.output) : null,
        toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : [],
        observations: row.observations ? JSON.parse(row.observations) : [],
        tokenUsage: row.token_usage ? JSON.parse(row.token_usage) : null,
        latencyMs: row.latency_ms,
        createdAt: row.created_at,
    };
}

function insertRecord(conn, record) {
    const id = generateId();
    conn.prepare(
        `INSERT INTO ioor_records
         (id, execution_id, node_id, turn_index, agent_id, profile_hash,
          model_provider, model_name, input, output, tool_calls, observations,
          token_usage, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id,
        record.executionId,
        record.nodeId,
        record.turnIndex,
        record.agentId ?? null,
        record.profileHash ?? null,
        record.modelProvider ?? null,
        record.modelName ?? null,
        record.input ? JSON.stringify(record.input) : null,
        record.output ? JSON.stringify(record.output) : null,
        JSON.stringify(record.toolCalls || []),
        JSON.stringify(record.observations || []),
        record.tokenUsage ? JSON.stringify(record.tokenUsage) : null,
        record.latencyMs ?? null,
    );
    return findById(conn, id);
}

function findById(conn, id) {
    return rowToEntity(conn.prepare('SELECT * FROM ioor_records WHERE id = ?').get(id));
}

function listByExecution(conn, executionId) {
    return conn
        .prepare('SELECT * FROM ioor_records WHERE execution_id = ? ORDER BY turn_index ASC, created_at ASC')
        .all(executionId)
        .map(rowToEntity);
}

function buildIoorRepository(db) {
    const conn = db || getDb();
    return {
        insert: (record) => insertRecord(conn, record),
        findById: (id) => findById(conn, id),
        listByExecution: (executionId) => listByExecution(conn, executionId),
    };
}

module.exports = { buildIoorRepository };
