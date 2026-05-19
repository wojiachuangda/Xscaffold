// [refactor] ID: V1.5-A.1-S4 | Date: 2026-05-19 | Description: 内置工具 queryDatabase——只读 SELECT（async 契约；走 driver.query）
'use strict';

const { z } = require('zod');
const { getDb } = require('../../infrastructure/database/connection');
const { ValidationError } = require('../../infrastructure/errors/AppError');

const paramsSchema = z
    .object({
        sql: z.string().min(1).max(2000),
        params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).default([]),
    })
    .strict();

function ensureReadOnly(sql) {
    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT')) {
        throw new ValidationError('queryDatabase 仅允许 SELECT 语句');
    }
}

async function handler(params, context = {}) {
    ensureReadOnly(params.sql);
    const driver = context.db || getDb();
    const { rows } = await driver.query(params.sql, params.params);
    return { rowCount: rows.length, rows };
}

module.exports = {
    name: 'queryDatabase',
    description: '执行只读 SQL 查询',
    paramsSchema,
    handler,
};
