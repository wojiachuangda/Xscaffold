// [planner] ID: V2.5-MT | Date: 2026-05-21 | Description: User 实体 Zod 契约（多租户：agent 归属的用户/租户主体）
'use strict';

const { z } = require('zod');

const UserStatusSchema = z.enum(['active', 'disabled']);

const UserSchema = z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(128),
    email: z.string().email().max(256),
    status: UserStatusSchema.default('active'),
    createdAt: z.string().datetime().optional(),
});

// 创建入参：id / createdAt 服务端生成
const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true }).strict();

module.exports = { UserSchema, UserStatusSchema, CreateUserSchema };
