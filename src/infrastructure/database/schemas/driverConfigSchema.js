// [planner] ID: V1.5-A.2 | Date: 2026-05-19 | Description: Driver 配置 Zod 契约——sqlite/postgres 双分支 discriminated union（AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

/**
 * 显式枚举避免 typo / 不安全字符串作为 driver 协议。
 * A.2 引入 'postgres' 分支。
 */
const DriverKindSchema = z.enum(['sqlite', 'postgres']);

/**
 * SQLite driver 配置：filename 是 ':memory:' 或绝对/相对路径
 */
const SqliteConfigSchema = z
    .object({
        driver: z.literal('sqlite'),
        filename: z.string().min(1),
    })
    .strict();

/**
 * PostgreSQL driver 配置：
 *   - connectionString 直接喂给 node-postgres（完整 libpq URI，含可选 query string）
 *   - poolMax 可调 pool 大小（默认 10，与 pg 默认一致）
 *
 * 设计取舍：不解构 host/port/database/user/password —— 让 pg.Pool 自己解析，
 * 避免在 schema 层重新实现 libpq 解析（密码可能含 URL-encoded 特殊字符）。
 */
const PgConfigSchema = z
    .object({
        driver: z.literal('postgres'),
        connectionString: z.string().min(1),
        poolMax: z.number().int().positive().max(100).optional(),
    })
    .strict();

/**
 * 总配置（discriminated union）。
 */
const DriverConfigSchema = z.discriminatedUnion('driver', [SqliteConfigSchema, PgConfigSchema]);

module.exports = {
    DriverKindSchema,
    SqliteConfigSchema,
    PgConfigSchema,
    DriverConfigSchema,
};
