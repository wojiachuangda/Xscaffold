// [scaffold] ID: T2.1 | Date: 2026-05-18 | Description: Tool 定义的 Zod Schema（AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

/**
 * Tool 定义：name + paramsSchema(Zod) + handler(async fn)
 */
const ToolDefSchema = z.object({
    name: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z][\w-]*$/u, '名称需以字母开头，仅允许字母/数字/下划线/中划线'),
    description: z.string().max(500).optional(),
    paramsSchema: z.any().refine((s) => s && typeof s.safeParse === 'function', '需为 Zod Schema'),
    handler: z.function().args(z.any(), z.any()).returns(z.any()),
    timeoutMs: z.number().int().positive().optional(),
});

module.exports = { ToolDefSchema };
