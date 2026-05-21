// [scaffold] ID: T5.1-SPEC | Date: 2026-05-18 | Description: 会话消息契约（AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);

const MessageSchema = z.object({
    id: z.string().min(1).max(64),
    sessionId: z.string().min(1).max(128),
    tenantId: z.string().max(64).nullable().optional(),
    ownerId: z.string().max(64).nullable().optional(),
    role: MessageRoleSchema,
    content: z.string().max(100000),
    metadata: z.record(z.any()).nullable().optional(),
    createdAt: z.string().datetime(),
});

const SaveMessageInputSchema = z
    .object({
        sessionId: z.string().min(1).max(128),
        tenantId: z.string().max(64).nullable().optional(),
        // V2.6 多租户长会话：归属用户；invoke 路径必传，workflow 内部调用免传由 repo 兜底 user_dev_default
        ownerId: z.string().min(1).max(64).optional(),
        role: MessageRoleSchema,
        content: z.string().max(100000),
        metadata: z.record(z.any()).optional(),
    })
    .strict();

const HistoryFilterSchema = z
    .object({
        sessionId: z.string().min(1).max(128),
        // 传入则按 owner 过滤（纵深防御）；不传维持 session-only，workflow 路径零改动
        ownerId: z.string().min(1).max(64).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(10),
    })
    .strict();

// V2.6 长会话上下文窗口配置（AA-SEAC §4.1 代码即契约）：二者取严——最近 maxMessages 条且估算 token ≤ maxTokens
const HistoryConfigSchema = z
    .object({
        maxMessages: z.coerce.number().int().min(1).max(200).default(20),
        maxTokens: z.coerce.number().int().min(256).max(200000).default(8000),
    })
    .strict();

module.exports = {
    MessageSchema,
    MessageRoleSchema,
    SaveMessageInputSchema,
    HistoryFilterSchema,
    HistoryConfigSchema,
};
