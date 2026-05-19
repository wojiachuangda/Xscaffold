// [planner] ID: V1.5-A.1 | Date: 2026-05-19 | Description: Driver 配置 Zod 契约——DATABASE_URL 解析结果的强类型校验（AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

/**
 * 当前 A.1 仅支持 sqlite。A.2 引入 PG 时会扩展为 z.enum(['sqlite', 'postgres']).
 * 显式枚举避免 typo / 不安全字符串作为 driver 协议。
 */
const DriverKindSchema = z.enum(['sqlite']);

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
 * 总配置（discriminated union）。A.2 时追加 PG 分支。
 */
const DriverConfigSchema = z.discriminatedUnion('driver', [SqliteConfigSchema]);

module.exports = {
    DriverKindSchema,
    SqliteConfigSchema,
    DriverConfigSchema,
};
