// [scaffold] ID: T1.3 | Date: 2026-05-18 | Description: Agent 数据访问层（AA-SEAC §3 约束 4：SQL 仅出现在此文件）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../infrastructure/database/connection');
const { ConflictError, NotFoundError } = require('../infrastructure/errors/AppError');

const UNIQUE_VIOLATION = 'SQLITE_CONSTRAINT_UNIQUE';

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

function findById(conn, id) {
    return rowToEntity(conn.prepare('SELECT * FROM agents WHERE id = ?').get(id));
}

function findByName(conn, name) {
    return rowToEntity(conn.prepare('SELECT * FROM agents WHERE name = ?').get(name));
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
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function findAll(conn, filter = {}) {
    const { whereSql, params } = buildWhere(filter);
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const rows = conn
        .prepare(`SELECT * FROM agents ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);
    const total = conn.prepare(`SELECT COUNT(*) AS c FROM agents ${whereSql}`).get(...params).c;
    return { items: rows.map(rowToEntity), total };
}

function insertAgent(conn, id, input, ts) {
    conn.prepare(
        `INSERT INTO agents (id, name, description, model, tools, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
        id,
        input.name,
        input.description ?? null,
        input.model,
        JSON.stringify(input.tools ?? []),
        input.status ?? 'enabled',
        ts,
        ts,
    );
}

function create(conn, input) {
    const id = generateId();
    const ts = nowIso();
    try {
        insertAgent(conn, id, input, ts);
    } catch (err) {
        if (err.code === UNIQUE_VIOLATION) {
            throw new ConflictError(`Agent 名称已存在: ${input.name}`);
        }
        throw err;
    }
    return findById(conn, id);
}

function updateAgentRow(conn, id, next) {
    conn.prepare(
        `UPDATE agents SET name = ?, description = ?, model = ?, tools = ?, status = ?, updated_at = ?
         WHERE id = ?`,
    ).run(next.name, next.description ?? null, next.model, JSON.stringify(next.tools ?? []), next.status, nowIso(), id);
}

function update(conn, id, patch) {
    const existing = findById(conn, id);
    if (!existing) {
        throw new NotFoundError(`Agent 不存在: ${id}`);
    }
    const next = { ...existing, ...patch };
    try {
        updateAgentRow(conn, id, next);
    } catch (err) {
        if (err.code === UNIQUE_VIOLATION) {
            throw new ConflictError(`Agent 名称已存在: ${next.name}`);
        }
        throw err;
    }
    return findById(conn, id);
}

function remove(conn, id) {
    const r = conn.prepare('DELETE FROM agents WHERE id = ?').run(id);
    if (r.changes === 0) {
        throw new NotFoundError(`Agent 不存在: ${id}`);
    }
    return true;
}

function buildRepository(db) {
    const conn = db || getDb();
    return {
        findById: (id) => findById(conn, id),
        findByName: (name) => findByName(conn, name),
        findAll: (filter) => findAll(conn, filter),
        create: (input) => create(conn, input),
        update: (id, patch) => update(conn, id, patch),
        remove: (id) => remove(conn, id),
    };
}

module.exports = { buildRepository };
