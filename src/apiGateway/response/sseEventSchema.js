// [architect] ID: V2.2-SSE | Date: 2026-05-21 | Description: SSE 流式事件 Zod 契约——agent invoke 流式端点对外的 start/turn/done/error 判别联合
'use strict';

const { z } = require('zod');

const STOP_REASONS = ['final', 'max_iterations'];

const TokenUsageSchema = z.object({
    prompt: z.number().int().nonnegative(),
    completion: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    cached_prompt_tokens: z.number().int().nonnegative(),
});

// toolCalls / observations 的 arguments·data 是 LLM / 工具产出的任意载荷，
// 由 SSE writer 在传输前做深度脱敏；此处类型保持 unknown，不强约束其结构。
const ToolCallSchema = z.object({
    id: z.string().optional(),
    name: z.string(),
    arguments: z.unknown(),
});

const ObservationSchema = z.object({
    name: z.string(),
    ok: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
});

const SseStartEventSchema = z
    .object({
        type: z.literal('start'),
        executionId: z.string().min(1),
        agentId: z.string().min(1),
        model: z.string().min(1),
        sessionId: z.string().min(1).optional(),
        ts: z.string().min(1),
    })
    .strict();

const SseTurnEventSchema = z
    .object({
        type: z.literal('turn'),
        turnIndex: z.number().int().nonnegative(),
        content: z.string(),
        toolCalls: z.array(ToolCallSchema),
        observations: z.array(ObservationSchema),
        ts: z.string().min(1),
    })
    .strict();

const SseDoneEventSchema = z
    .object({
        type: z.literal('done'),
        content: z.string(),
        stopReason: z.enum(STOP_REASONS),
        turnCount: z.number().int().nonnegative(),
        tokenUsage: TokenUsageSchema,
        ts: z.string().min(1),
    })
    .strict();

const SseErrorEventSchema = z
    .object({
        type: z.literal('error'),
        message: z.string().min(1),
        ts: z.string().min(1),
    })
    .strict();

const SseEventSchema = z.discriminatedUnion('type', [
    SseStartEventSchema,
    SseTurnEventSchema,
    SseDoneEventSchema,
    SseErrorEventSchema,
]);

module.exports = {
    SseEventSchema,
    SseStartEventSchema,
    SseTurnEventSchema,
    SseDoneEventSchema,
    SseErrorEventSchema,
    TokenUsageSchema,
    SSE_EVENT_TYPES: ['start', 'turn', 'done', 'error'],
    STOP_REASONS,
};
