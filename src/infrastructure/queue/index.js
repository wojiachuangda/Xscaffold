// [refactor] ID: V1.5-B | Date: 2026-05-20 | Description: 队列 driver dispatch——按 QUEUE_DRIVER + REDIS_URL 选择 memory/bullmq 实现
'use strict';

const { QueueConfigSchema } = require('./schemas/queueConfigSchema');
const { createInMemoryAdapter } = require('./inMemoryAdapter');
const { createBullmqAdapter } = require('./bullmqAdapter');

/**
 * 从 process.env 解析队列配置。
 *
 * 显式 dispatch（PLAN_V1.5-B D-B-1）：
 *   - QUEUE_DRIVER 缺省 / 'memory' → 内存队列（默认）
 *   - QUEUE_DRIVER === 'bullmq' → 必须同时提供 REDIS_URL（或 REDIS_TEST_URL）
 *
 * @param {NodeJS.ProcessEnv} [envSource]
 * @returns {import('zod').infer<typeof QueueConfigSchema>}
 */
function parseQueueConfig(envSource) {
    const env = envSource || process.env;
    const driver = (env.QUEUE_DRIVER || 'memory').trim();
    const tunables = {
        concurrency: readPositiveInt(env.QUEUE_CONCURRENCY),
        maxAttempts: readPositiveInt(env.QUEUE_MAX_ATTEMPTS),
    };
    if (driver === 'memory') {
        return buildMemoryConfig(tunables);
    }
    if (driver === 'bullmq') {
        return buildBullmqConfig(env, tunables);
    }
    throw new Error(`不支持的 QUEUE_DRIVER（仅 memory/bullmq），收到: ${driver}`);
}

function buildMemoryConfig({ concurrency, maxAttempts }) {
    return QueueConfigSchema.parse({
        driver: 'memory',
        ...(concurrency !== undefined && { concurrency }),
        ...(maxAttempts !== undefined && { maxAttempts }),
    });
}

function buildBullmqConfig(env, { concurrency, maxAttempts }) {
    const connectionUrl = (env.REDIS_URL || env.REDIS_TEST_URL || '').trim();
    if (!connectionUrl) {
        throw new Error('QUEUE_DRIVER=bullmq 需要同时设置 REDIS_URL（或测试环境的 REDIS_TEST_URL）');
    }
    return QueueConfigSchema.parse({
        driver: 'bullmq',
        connectionUrl,
        ...(concurrency !== undefined && { concurrency }),
        ...(maxAttempts !== undefined && { maxAttempts }),
    });
}

function readPositiveInt(raw) {
    if (!raw) {
        return undefined;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
        return undefined;
    }
    return Math.floor(n);
}

/**
 * 工厂：按配置返回队列实例。
 */
function createQueue(config) {
    if (config.driver === 'memory') {
        return createInMemoryAdapter(config);
    }
    if (config.driver === 'bullmq') {
        return createBullmqAdapter(config);
    }
    throw new Error(`未实现的队列 driver: ${config.driver}`);
}

module.exports = {
    parseQueueConfig,
    createQueue,
};
