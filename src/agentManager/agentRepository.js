// [refactor] ID: V1.5-A.1-S4 | Date: 2026-05-19 | Description: Agent 数据访问层（async 契约；SQL 仅出现在此文件；AA-SEAC §3 约束 4）
'use strict';

const crypto = require('crypto');

const { AgentStatusSchema } = require('./agentSchema');
const { getDb } = require('../infrastructure/database/connection');
const { ConflictError, NotFoundError, ValidationError } = require('../infrastructure/errors/AppError');

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        model: row.model,
        tools: JSON.parse(row.tools || '[]'),
        status: row.status,
        ownerId: row.owner_id,
        systemPrompt: row.system_prompt ?? null,
        temperature: row.temperature,
        maxTurns: row.max_turns,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function nowIso() {
    return new Date().toISOString();
}

function generateId() {
    return `agent_${crypto.randomBytes(8).toString('hex')}`;
}

function assertValidStatus(status) {
    const parsed = AgentStatusSchema.safeParse(status);
    if (!parsed.success) {
        throw new ValidationError('Agent status 不合法', [
            { path: 'status', code: 'invalid_enum_value', message: 'status must be enabled or disabled' },
        ]);
    }
}

async function findById(driver, id) {
    const { rows } = await driver.query('SELECT * FROM agents WHERE id = ?', [id]);
    return rowToEntity(rows[0]);
}

async function findByName(driver, name) {
    const { rows } = await driver.query('SELECT * FROM agents WHERE name = ?', [name]);
    return rowToEntity(rows[0]);
}

function buildWhere(filter) {
    const where = [];
    const params = [];
    if (filter.status) {
        where.push('status = ?');
        params.push(filter.status);
    }
    if (filter.name) {
        where.push('name LIKE ?');
        params.push(`%${filter.name}%`);
    }
    if (filter.ownerId) {
        where.push('owner_id = ?');
        params.push(filter.ownerId);
    }
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll(driver, filter = {}) {
    const { whereSql, params } = buildWhere(filter);
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const rowsResult = await driver.query(
        `SELECT * FROM agents ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
    );
    const countResult = await driver.query(`SELECT COUNT(*) AS c FROM agents ${whereSql}`, params);
    return {
        items: rowsResult.rows.map(rowToEntity),
        total: countResult.rows[0].c,
    };
}

async function insertAgent(driver, id, input, ts) {
    assertValidStatus(input.status ?? 'enabled');
    await driver.run(
        `INSERT INTO agents (id, name, description, model, tools, status, owner_id, system_prompt, temperature, max_turns, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            input.name,
            input.description ?? null,
            input.model,
            JSON.stringify(input.tools ?? []),
            input.status ?? 'enabled',
            // 内部调用（workflow agent 节点等）可不传 ownerId → 落到 dev 默认归属，与迁移 009 列默认值一致
            input.ownerId ?? 'user_dev_default',
            input.systemPrompt ?? null,
            input.temperature ?? 0.7,
            input.maxTurns ?? 8,
            ts,
            ts,
        ],
    );
}

async function create(driver, input) {
    const id = generateId();
    const ts = nowIso();
    try {
        await insertAgent(driver, id, input, ts);
    } catch (err) {
        if (driver.isUniqueViolation(err)) {
            throw new ConflictError(`Agent 名称已存在: ${input.name}`);
        }
        throw err;
    }
    return findById(driver, id);
}

async function updateAgentRow(driver, id, next) {
    assertValidStatus(next.status);
    await driver.run(
        `UPDATE agents SET name = ?, description = ?, model = ?, tools = ?, status = ?,
            system_prompt = ?, temperature = ?, max_turns = ?, updated_at = ?
         WHERE id = ?`,
        [
            next.name,
            next.description ?? null,
            next.model,
            JSON.stringify(next.tools ?? []),
            next.status,
            next.systemPrompt ?? null,
            next.temperature ?? 0.7,
            next.maxTurns ?? 8,
            nowIso(),
            id,
        ],
    );
}

async function update(driver, id, patch) {
    const existing = await findById(driver, id);
    if (!existing) {
        throw new NotFoundError(`Agent 不存在: ${id}`);
    }
    const next = { ...existing, ...patch };
    try {
        await updateAgentRow(driver, id, next);
    } catch (err) {
        if (driver.isUniqueViolation(err)) {
            throw new ConflictError(`Agent 名称已存在: ${next.name}`);
        }
        throw err;
    }
    return findById(driver, id);
}

async function remove(driver, id) {
    const r = await driver.run('DELETE FROM agents WHERE id = ?', [id]);
    if (r.changes === 0) {
        throw new NotFoundError(`Agent 不存在: ${id}`);
    }
    return true;
}

function buildRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        findById: (id) => findById(driver, id),
        findByName: (name) => findByName(driver, name),
        findAll: (filter) => findAll(driver, filter),
        create: (input) => create(driver, input),
        update: (id, patch) => update(driver, id, patch),
        remove: (id) => remove(driver, id),
    };
}

module.exports = { buildRepository };
