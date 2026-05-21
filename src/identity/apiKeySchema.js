// [planner] ID: V2.5-MT | Date: 2026-05-21 | Description: ApiKey 实体 Zod 契约（多租户：Header key → user 解析；库内只存 SHA-256 哈希）
'use strict';

const { z } = require('zod');

const ApiKeyStatusSchema = z.enum(['active', 'revoked']);

// 完整实体（库内形态）：只存 keyHash，绝不存明文
const ApiKeySchema = z.object({
    id: z.string().min(1).max(64),
    userId: z.string().min(1).max(64),
    keyHash: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    status: ApiKeyStatusSchema.default('active'),
    createdAt: z.string().datetime().optional(),
});

// 创建入参：userId + name（标签）；明文 key 服务端生成、只回一次，库存哈希
const CreateApiKeySchema = z
    .object({
        userId: z.string().min(1).max(64),
        name: z.string().min(1).max(128),
    })
    .strict();

module.exports = { ApiKeySchema, ApiKeyStatusSchema, CreateApiKeySchema };
