// [planner] ID: PAM-4 | Date: 2026-05-19 | Description: Event 数据访问层（不可变事件流水；async 契约；SQL 仅在此文件；AA-SEAC §3 约束 4）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../../../infrastructure/database/connection');

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        eventId: row.event_id,
        projectId: row.project_id,
        type: row.type,
        title: row.title,
        content: row.content ?? null,
        severity: row.severity,
        createdAt: row.created_at,
    };
}

function generateId() {
    return `event_${crypto.randomBytes(8).toString('hex')}`;
}

async function findById(driver, eventId) {
    const { rows } = await driver.query('SELECT * FROM pa_events WHERE event_id = ?', [eventId]);
    return rowToEntity(rows[0]);
}

// 事件流水不可变：仅 INSERT，无 update/delete。
async function insert(driver, input) {
    const eventId = generateId();
    const createdAt = new Date().toISOString();
    await driver.run(
        `INSERT INTO pa_events (event_id, project_id, type, title, content, severity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            eventId,
            input.projectId,
            input.type,
            input.title,
            input.content ?? null,
            input.severity ?? 'normal',
            createdAt,
        ],
    );
    return findById(driver, eventId);
}

async function listRecent(driver, projectId, limit) {
    const { rows } = await driver.query(
        'SELECT * FROM pa_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?',
        [projectId, limit],
    );
    return rows.map(rowToEntity);
}

async function listByProject(driver, projectId, page = {}) {
    const limit = page.limit ?? 50;
    const offset = page.offset ?? 0;
    const rowsResult = await driver.query(
        'SELECT * FROM pa_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [projectId, limit, offset],
    );
    const countResult = await driver.query('SELECT COUNT(*) AS c FROM pa_events WHERE project_id = ?', [projectId]);
    return {
        items: rowsResult.rows.map(rowToEntity),
        total: Number(countResult.rows[0]?.c || 0),
    };
}

function buildEventRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        insert: (input) => insert(driver, input),
        findById: (eventId) => findById(driver, eventId),
        listRecent: (projectId, limit) => listRecent(driver, projectId, limit),
        listByProject: (projectId, page) => listByProject(driver, projectId, page),
    };
}

module.exports = { buildEventRepository };
