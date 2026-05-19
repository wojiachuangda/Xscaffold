// [planner] ID: PAM-2 | Date: 2026-05-19 | Description: Project 数据访问层（async 契约；SQL 仅在此文件；AA-SEAC §3 约束 4）
'use strict';

const { getDb } = require('../../../infrastructure/database/connection');

/** projectUpdateStatus 允许修改的字段（Q3 白名单；name/projectId 永不可改） */
const UPDATABLE_FIELDS = ['phase', 'status', 'health', 'completion', 'summary'];

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return {
        projectId: row.project_id,
        name: row.name,
        phase: row.phase,
        status: row.status,
        health: row.health,
        completion: row.completion,
        summary: row.summary,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function nowIso() {
    return new Date().toISOString();
}

async function getByProjectId(driver, projectId) {
    const { rows } = await driver.query('SELECT * FROM projects WHERE project_id = ?', [projectId]);
    return rowToEntity(rows[0]);
}

// Q13：MVP 无独立 projectCreate Tool，首次落库时 name 兜底取 projectId。
async function insertProject(driver, projectId, patch, ts) {
    await driver.run(
        `INSERT INTO projects (project_id, name, phase, status, health, completion, summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            projectId,
            projectId,
            patch.phase ?? '',
            patch.status ?? 'active',
            patch.health ?? 'green',
            patch.completion ?? 0,
            patch.summary ?? '',
            ts,
            ts,
        ],
    );
}

async function updateProject(driver, existing, patch, ts) {
    const next = {};
    for (const field of UPDATABLE_FIELDS) {
        next[field] = patch[field] ?? existing[field];
    }
    await driver.run(
        `UPDATE projects SET phase = ?, status = ?, health = ?, completion = ?, summary = ?, updated_at = ?
         WHERE project_id = ?`,
        [next.phase, next.status, next.health, next.completion, next.summary, ts, existing.projectId],
    );
}

/**
 * upsert 语义：项目不存在则按默认值 INSERT，存在则只更新白名单字段。
 */
async function upsertStatus(driver, projectId, patch) {
    const existing = await getByProjectId(driver, projectId);
    const ts = nowIso();
    if (existing) {
        await updateProject(driver, existing, patch, ts);
    } else {
        await insertProject(driver, projectId, patch, ts);
    }
    return getByProjectId(driver, projectId);
}

function buildProjectRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        getByProjectId: (projectId) => getByProjectId(driver, projectId),
        upsertStatus: (projectId, patch) => upsertStatus(driver, projectId, patch),
    };
}

module.exports = { buildProjectRepository };
