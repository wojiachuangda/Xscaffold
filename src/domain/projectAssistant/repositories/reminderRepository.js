// [planner] ID: PAM-5 | Date: 2026-05-19 | Description: Reminder 数据访问层（async 契约；SQL 仅在此文件；AA-SEAC §3 约束 4）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../../../infrastructure/database/connection');

/** 创建时的初始状态（MVP 无状态变更 Tool，故不接入状态机） */
const INITIAL_STATUS = 'open';

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        reminderId: row.reminder_id,
        projectId: row.project_id,
        title: row.title,
        content: row.content ?? null,
        dueAt: row.due_at,
        severity: row.severity,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function generateId() {
    return `reminder_${crypto.randomBytes(8).toString('hex')}`;
}

async function findById(driver, reminderId) {
    const { rows } = await driver.query('SELECT * FROM pa_reminders WHERE reminder_id = ?', [reminderId]);
    return rowToEntity(rows[0]);
}

async function insert(driver, input) {
    const reminderId = generateId();
    const ts = new Date().toISOString();
    await driver.run(
        `INSERT INTO pa_reminders
         (reminder_id, project_id, title, content, due_at, severity, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            reminderId,
            input.projectId,
            input.title,
            input.content ?? null,
            input.dueAt,
            input.severity ?? 'normal',
            INITIAL_STATUS,
            ts,
            ts,
        ],
    );
    return findById(driver, reminderId);
}

// 到期 = 未完成(status=open) 且 due_at 不晚于 before。
function buildDueWhere(filter) {
    const where = ['status = ?', 'due_at <= ?'];
    const params = [INITIAL_STATUS, filter.before];
    if (filter.projectId) {
        where.push('project_id = ?');
        params.push(filter.projectId);
    }
    return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

async function listDue(driver, filter) {
    const { whereSql, params } = buildDueWhere(filter);
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const rowsResult = await driver.query(
        `SELECT * FROM pa_reminders ${whereSql} ORDER BY due_at ASC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
    );
    const countResult = await driver.query(`SELECT COUNT(*) AS c FROM pa_reminders ${whereSql}`, params);
    return {
        items: rowsResult.rows.map(rowToEntity),
        total: countResult.rows[0].c,
    };
}

function buildReminderRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        insert: (input) => insert(driver, input),
        findById: (reminderId) => findById(driver, reminderId),
        listDue: (filter) => listDue(driver, filter),
    };
}

module.exports = { buildReminderRepository };
