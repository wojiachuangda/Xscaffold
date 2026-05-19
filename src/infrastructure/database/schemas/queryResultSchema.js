// [planner] ID: V1.5-A.1 | Date: 2026-05-19 | Description: Driver query/run 返回结构 Zod 契约（AA-SEAC §3 约束 4：Repository 上层只感知此抽象）
'use strict';

const { z } = require('zod');

/**
 * SELECT 类查询返回结构。
 * - rows: 行对象数组；字段名/类型由具体 driver 决定（SQLite 全字符串/数字，PG 时含 Date/JSONB 反序列化）
 */
const QueryResultSchema = z
    .object({
        rows: z.array(z.record(z.string(), z.unknown())),
    })
    .strict();

/**
 * INSERT/UPDATE/DELETE 类写入返回结构。
 * - changes: 受影响行数
 * - lastInsertRowid: SQLite 的 rowid；PG 中不返回（PG 用 RETURNING 子句替代）
 */
const RunResultSchema = z
    .object({
        changes: z.number().int().nonnegative(),
        lastInsertRowid: z.union([z.string(), z.number(), z.bigint()]).optional(),
    })
    .strict();

module.exports = {
    QueryResultSchema,
    RunResultSchema,
};
