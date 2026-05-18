// [scaffold] ID: T1.2 | Date: 2026-05-18 | Description: Agent 实体 Zod Schema（AA-SEAC §3 约束 2 入参强校验、§4.1 代码即契约）
'use strict';

const { z } = require('zod');

const AgentStatusSchema = z.enum(['enabled', 'disabled']);

/**
 * 完整 Agent 实体（从存储读取出来后的形态）
 */
const AgentSchema = z.object({
    id: z.string().min(1).max(64),
    name: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[\w\-. ]+$/u, '名称仅允许字母/数字/中划线/下划线/点/空格'),
    description: z.string().max(2000).nullable().optional(),
    model: z.string().min(1).max(128),
    tools: z.array(z.string().min(1).max(128)).default([]),
    status: AgentStatusSchema.default('enabled'),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
});

/**
 * 创建入参：不含 id / 时间戳（由服务端生成）
 */
const CreateAgentSchema = AgentSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
}).strict();

/**
 * 更新入参：所有字段可选，但至少 1 个字段
 */
const UpdateAgentSchema = AgentSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
})
    .partial()
    .strict()
    .refine((obj) => Object.keys(obj).length > 0, '更新内容不能为空');

/**
 * 列表过滤参数
 */
const ListAgentsFilterSchema = z
    .object({
        status: AgentStatusSchema.optional(),
        name: z.string().max(128).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
    })
    .strict();

module.exports = {
    AgentSchema,
    AgentStatusSchema,
    CreateAgentSchema,
    UpdateAgentSchema,
    ListAgentsFilterSchema,
};
