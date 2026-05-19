// [planner] ID: V1.5-B | Date: 2026-05-20 | Description: 队列配置 Zod 契约——memory/bullmq 双分支 discriminated union（AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

/**
 * 显式枚举避免 typo 作为 driver。
 * 默认 'memory'；显式 'bullmq' 才切换到 Redis 持久化队列。
 */
const QueueDriverKindSchema = z.enum(['memory', 'bullmq']);

/**
 * 内存队列配置：
 *   - concurrency / maxAttempts 当前不被内存实现读取（无限并发、无重试），
 *     收进 schema 是为了两 driver 接受同一组可选参数，方便上层 dispatch 统一收集
 */
const MemoryConfigSchema = z
    .object({
        driver: z.literal('memory'),
        concurrency: z.number().int().positive().max(1024).optional(),
        maxAttempts: z.number().int().positive().max(100).optional(),
    })
    .strict();

/**
 * BullMQ 配置：
 *   - connectionUrl 直接喂 ioredis（含可选 query string）
 *   - concurrency 默认 5（PLAN_V1.5-B D-B-5）
 *   - maxAttempts 默认 1（PLAN_V1.5-B D-B-4，不重试，避免与工作流自愈叠加）
 */
const BullmqConfigSchema = z
    .object({
        driver: z.literal('bullmq'),
        connectionUrl: z.string().min(1),
        concurrency: z.number().int().positive().max(1024).default(5),
        maxAttempts: z.number().int().positive().max(100).default(1),
    })
    .strict();

const QueueConfigSchema = z.discriminatedUnion('driver', [MemoryConfigSchema, BullmqConfigSchema]);

module.exports = {
    QueueDriverKindSchema,
    MemoryConfigSchema,
    BullmqConfigSchema,
    QueueConfigSchema,
};
