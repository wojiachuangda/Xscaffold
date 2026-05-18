// [scaffold] ID: T5.3-SPEC | Date: 2026-05-18 | Description: IOOR 协议契约（AA-SEAC §4.2 全量流式追踪）
'use strict';

const { z } = require('zod');

const ToolCallSchema = z.object({
    toolName: z.string(),
    arguments: z.record(z.any()),
});

const ObservationSchema = z.object({
    toolName: z.string(),
    success: z.boolean(),
    result: z.any().nullable(),
    error: z.string().nullable(),
});

const TokenUsageSchema = z.object({
    prompt: z.number().int().nonnegative(),
    completion: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    cached_prompt_tokens: z.number().int().nonnegative().default(0),
});

const IoorRecordSchema = z.object({
    id: z.string().min(1).max(64),
    executionId: z.string().min(1).max(64),
    nodeId: z.string().min(1).max(64),
    turnIndex: z.number().int().nonnegative(),
    agentId: z.string().nullable().optional(),
    profileHash: z.string().length(64).nullable().optional(),
    modelProvider: z.string().max(64).nullable().optional(),
    modelName: z.string().max(128).nullable().optional(),
    input: z.any(),
    output: z
        .object({
            content: z.string().nullable(),
            reasoning_content: z.string().nullable(),
        })
        .nullable(),
    toolCalls: z.array(ToolCallSchema).default([]),
    observations: z.array(ObservationSchema).default([]),
    tokenUsage: TokenUsageSchema.nullable(),
    latencyMs: z.number().int().nonnegative().nullable(),
    createdAt: z.string().datetime(),
});

const IoorWriteInputSchema = IoorRecordSchema.omit({ id: true, createdAt: true }).extend({
    toolCalls: z.array(ToolCallSchema).optional(),
    observations: z.array(ObservationSchema).optional(),
});

module.exports = {
    IoorRecordSchema,
    IoorWriteInputSchema,
    TokenUsageSchema,
    ToolCallSchema,
    ObservationSchema,
};
