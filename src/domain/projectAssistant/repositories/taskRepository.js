// [planner] ID: PAM-3 | Date: 2026-05-19 | Description: Task 数据访问层（async 契约；SQL 仅在此文件；AA-SEAC §3 约束 4）
'use strict';

const { getDb } = require('../../../infrastructure/database/connection');

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        projectId: row.project_id,
        taskId: row.task_id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        notes: row.notes ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function nowIso() {
    return new Date().toISOString();
}

async function findOne(driver, projectId, taskId) {
    const { rows } = await driver.query('SELECT * FROM pa_tasks WHERE project_id = ? AND task_id = ?', [
        projectId,
        taskId,
    ]);
    return rowToEntity(rows[0]);
}

async function insertTask(driver, input, ts) {
    await driver.run(
        `INSERT INTO pa_tasks (project_id, task_id, title, status, priority, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            input.projectId,
            input.taskId,
            input.title,
            input.status ?? 'open',
            input.priority ?? 'normal',
            input.notes ?? null,
            ts,
            ts,
        ],
    );
}

async function updateTask(driver, existing, input, ts) {
    // notes 区分「未提供」(保留原值) 与「显式 null」(清空)
    const notes = input.notes === undefined ? existing.notes : input.notes;
    await driver.run(
        `UPDATE pa_tasks SET title = ?, status = ?, priority = ?, notes = ?, updated_at = ?
         WHERE project_id = ? AND task_id = ?`,
        [
            input.title,
            input.status ?? existing.status,
            input.priority ?? existing.priority,
            notes,
            ts,
            existing.projectId,
            existing.taskId,
        ],
    );
}

async function upsert(driver, input) {
    const existing = await findOne(driver, input.projectId, input.taskId);
    const ts = nowIso();
    if (existing) {
        await updateTask(driver, existing, input, ts);
    } else {
        await insertTask(driver, input, ts);
    }
    return findOne(driver, input.projectId, input.taskId);
}

function buildWhere(filter) {
    const where = ['project_id = ?'];
    const params = [filter.projectId];
    if (filter.status) {
        where.push('status = ?');
        params.push(filter.status);
    }
    if (filter.priority) {
        where.push('priority = ?');
        params.push(filter.priority);
    }
    return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

async function list(driver, filter) {
    const { whereSql, params } = buildWhere(filter);
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const rowsResult = await driver.query(
        `SELECT * FROM pa_tasks ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
    );
    const countResult = await driver.query(`SELECT COUNT(*) AS c FROM pa_tasks ${whereSql}`, params);
    return {
        items: rowsResult.rows.map(rowToEntity),
        total: countResult.rows[0].c,
    };
}

function buildTaskRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        findOne: (projectId, taskId) => findOne(driver, projectId, taskId),
        upsert: (input) => upsert(driver, input),
        list: (filter) => list(driver, filter),
    };
}

module.exports = { buildTaskRepository };
