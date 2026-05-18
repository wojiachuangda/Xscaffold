// [scaffold] ID: T2.2 | Date: 2026-05-18 | Description: 内置工具 queryDatabase——在主库执行只读 SQL（仅 SELECT）
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
    const db = context.db || getDb();
    const rows = db.prepare(params.sql).all(...params.params);
    return { rowCount: rows.length, rows };
}

module.exports = {
    name: 'queryDatabase',
    description: '执行只读 SQL 查询',
    paramsSchema,
    handler,
};
