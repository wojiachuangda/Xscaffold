// [refactor] ID: V1.5-A.1-S4 | Date: 2026-05-19 | Description: IOOR 记录存储（async 契约；SQL 仅在此文件）
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

async function findById(driver, id) {
    const { rows } = await driver.query('SELECT * FROM ioor_records WHERE id = ?', [id]);
    return rowToEntity(rows[0]);
}

async function insertRecord(driver, record) {
    const id = generateId();
    // 复用 recordToParams（批插同款映射）：补 id、去掉末尾 created_at（单插由 DB 默认）。
    // 单插/批插自此共享同一列映射，complexity 也回落到装配级。
    const params = recordToParams({ ...record, id }).slice(0, -1);
    await driver.run(
        `INSERT INTO ioor_records
         (id, execution_id, node_id, turn_index, agent_id, profile_hash,
          model_provider, model_name, input, output, tool_calls, observations,
          token_usage, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params,
    );
    return findById(driver, id);
}

async function listByExecution(driver, executionId) {
    const { rows } = await driver.query(
        'SELECT * FROM ioor_records WHERE execution_id = ? ORDER BY turn_index ASC, created_at ASC',
        [executionId],
    );
    return rows.map(rowToEntity);
}

// 单条 INSERT 列序（含 created_at——批量场景 created_at 由 buffer 在入队时确定）
const INSERT_COLUMNS =
    '(id, execution_id, node_id, turn_index, agent_id, profile_hash, ' +
    'model_provider, model_name, input, output, tool_calls, observations, ' +
    'token_usage, latency_ms, created_at)';
const ROW_PLACEHOLDER = `(${new Array(15).fill('?').join(', ')})`;
// 单条 SQL 最多承载的行数：15 列 × 200 = 3000 占位符，远低于 SQLite/PG 上限
const MAX_ROWS_PER_STATEMENT = 200;

function jsonOrNull(value) {
    return value === null || value === undefined ? null : JSON.stringify(value);
}

function recordToParams(record) {
    return [
        record.id,
        record.executionId,
        record.nodeId,
        record.turnIndex,
        record.agentId ?? null,
        record.profileHash ?? null,
        record.modelProvider ?? null,
        record.modelName ?? null,
        jsonOrNull(record.input),
        jsonOrNull(record.output),
        JSON.stringify(record.toolCalls || []),
        JSON.stringify(record.observations || []),
        jsonOrNull(record.tokenUsage),
        record.latencyMs ?? null,
        record.createdAt,
    ];
}

/**
 * 批量插入 IOOR 记录（V1.5 批量缓冲）。
 * 入参 records 必须已带 id 与 createdAt（由 ioorBuffer 在入队时生成）。
 * 超过单 SQL 承载上限时内部分块。
 *
 * @returns {Promise<{ inserted: number }>}
 */
async function insertManyRecords(driver, records) {
    if (!Array.isArray(records) || records.length === 0) {
        return { inserted: 0 };
    }
    for (let i = 0; i < records.length; i += MAX_ROWS_PER_STATEMENT) {
        const chunk = records.slice(i, i + MAX_ROWS_PER_STATEMENT);
        const values = new Array(chunk.length).fill(ROW_PLACEHOLDER).join(', ');
        const sql = `INSERT INTO ioor_records ${INSERT_COLUMNS} VALUES ${values}`;
        const params = chunk.flatMap(recordToParams);
        // eslint-disable-next-line no-await-in-loop
        await driver.run(sql, params);
    }
    return { inserted: records.length };
}

function buildIoorRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        insert: (record) => insertRecord(driver, record),
        insertMany: (records) => insertManyRecords(driver, records),
        findById: (id) => findById(driver, id),
        listByExecution: (executionId) => listByExecution(driver, executionId),
    };
}

module.exports = { buildIoorRepository };
