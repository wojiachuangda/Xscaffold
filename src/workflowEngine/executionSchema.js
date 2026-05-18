// [scaffold] ID: T4.3-SPEC | Date: 2026-05-18 | Description: 工作流执行记录契约（AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

const ExecutionStatusSchema = z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'STUCK', 'TIMEOUT']);

const ExecutionSchema = z.object({
    id: z.string().min(1).max(64),
    workflowId: z.string().min(1).max(128),
    status: ExecutionStatusSchema,
    input: z.record(z.any()).nullable(),
    result: z.record(z.any()).nullable(),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
});

const ExecuteRequestSchema = z
    .object({
        input: z.record(z.any()).optional(),
    })
    .strict()
    .default({});

const WorkflowIdParamSchema = z.object({
    id: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[\w-]+$/u),
});

const ExecutionIdParamSchema = z.object({
    id: z
        .string()
        .min(1)
        .max(64)
        .regex(/^exec_[a-z0-9]+$/iu),
});

module.exports = {
    ExecutionStatusSchema,
    ExecutionSchema,
    ExecuteRequestSchema,
    WorkflowIdParamSchema,
    ExecutionIdParamSchema,
};
