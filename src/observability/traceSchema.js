// [scaffold] ID: T5.4-SPEC | Date: 2026-05-18 | Description: 节点级 trace 契约
'use strict';

const { z } = require('zod');

const NodeTraceSchema = z.object({
    id: z.string().min(1).max(64),
    executionId: z.string().min(1).max(64),
    nodeId: z.string().min(1).max(64),
    nodeType: z.enum(['agent', 'tool', 'condition', 'code']),
    status: z.enum(['RUNNING', 'SUCCESS', 'FAILED', 'STUCK', 'TIMEOUT']),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    attempt: z.number().int().min(1).default(1),
    output: z.any().nullable(),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

module.exports = { NodeTraceSchema };
