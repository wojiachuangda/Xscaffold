// [scaffold] ID: T5.1-SPEC | Date: 2026-05-18 | Description: 会话消息契约（AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);

const MessageSchema = z.object({
    id: z.string().min(1).max(64),
    sessionId: z.string().min(1).max(128),
    tenantId: z.string().max(64).nullable().optional(),
    role: MessageRoleSchema,
    content: z.string().max(100000),
    metadata: z.record(z.any()).nullable().optional(),
    createdAt: z.string().datetime(),
});

const SaveMessageInputSchema = z
    .object({
        sessionId: z.string().min(1).max(128),
        tenantId: z.string().max(64).nullable().optional(),
        role: MessageRoleSchema,
        content: z.string().max(100000),
        metadata: z.record(z.any()).optional(),
    })
    .strict();

const HistoryFilterSchema = z
    .object({
        sessionId: z.string().min(1).max(128),
        limit: z.coerce.number().int().min(1).max(200).default(10),
    })
    .strict();

module.exports = {
    MessageSchema,
    MessageRoleSchema,
    SaveMessageInputSchema,
    HistoryFilterSchema,
};
