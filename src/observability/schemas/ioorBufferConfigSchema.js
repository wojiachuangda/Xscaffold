// [planner] ID: V1.5-IOOR-BATCH | Date: 2026-05-20 | Description: IOOR 缓冲配置 Zod 契约（批量大小 / flush 间隔；AA-SEAC §4.1 代码即契约）
'use strict';

const { z } = require('zod');

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_INTERVAL_MS = 1000;

/**
 * IOOR 批量缓冲配置。
 *
 * - batchSize：缓冲累计达到此条数立即触发 flush（有界窗口的「条数」维度）
 * - intervalMs：定时扫描间隔，有数据即 flush（有界窗口的「时间」维度）
 *
 * 二者共同界定 AA-SEAC §4.2 修订后的「有界缓冲窗口」——非受控崩溃下
 * 最多丢失一个窗口的数据，此风险须在修订日志与 .env.example 显式声明。
 */
const IoorBufferConfigSchema = z
    .object({
        batchSize: z.number().int().positive().max(10000).default(DEFAULT_BATCH_SIZE),
        intervalMs: z.number().int().positive().max(600000).default(DEFAULT_INTERVAL_MS),
    })
    .strict();

module.exports = {
    IoorBufferConfigSchema,
    DEFAULT_BATCH_SIZE,
    DEFAULT_INTERVAL_MS,
};
