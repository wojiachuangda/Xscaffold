// [refactor] ID: V1.5-B | Date: 2026-05-20 | Description: BullMQ + Redis 持久化队列适配器（per-name Queue/Worker；async 契约；状态归一）
'use strict';

const { logger } = require('../../observability/logger');

// BullMQ 状态 → 契约状态 单一映射表（PLAN_V1.5-B §2.3 步骤 5）
const STATE_MAP = Object.freeze({
    waiting: 'PENDING',
    'waiting-children': 'PENDING',
    delayed: 'PENDING',
    paused: 'PENDING',
    active: 'RUNNING',
    completed: 'SUCCESS',
    failed: 'FAILED',
    unknown: 'FAILED',
});

let bullmqLibCache = null;
let ioredisLibCache = null;

function loadDeps() {
    if (!bullmqLibCache) {
        // eslint-disable-next-line global-require
        bullmqLibCache = require('bullmq');
        // eslint-disable-next-line global-require
        ioredisLibCache = require('ioredis');
    }
    return { bullmq: bullmqLibCache, IORedis: ioredisLibCache };
}

/**
 * 映射 BullMQ 内部状态到本项目队列契约状态。
 * @param {string} bullState
 */
function mapStatus(bullState) {
    return STATE_MAP[bullState] || 'PENDING';
}

/**
 * 把 BullMQ Job 实例归一为契约 sanitize 形态。
 * @param {{ id?: string, name?: string, returnvalue?: unknown, failedReason?: string, timestamp?: number, finishedOn?: number }} job
 * @param {string} status
 */
function sanitize(job, status) {
    return {
        id: job.id,
        name: job.name,
        status,
        result: job.returnvalue ?? null,
        error: job.failedReason ? { message: job.failedReason, code: 'JOB_FAILED' } : null,
        createdAt: job.timestamp,
        finishedAt: job.finishedOn || null,
    };
}

/**
 * 构造 BullMQ 连接配置。
 * Worker 必须设置 maxRetriesPerRequest: null（bullmq 强制约束）。
 */
function buildConnection(IORedis, connectionUrl) {
    return new IORedis(connectionUrl, { maxRetriesPerRequest: null });
}

/**
 * per-name 注册/复用 Queue 实例。
 */
function getOrCreateQueue(state, name) {
    let entry = state.byName.get(name);
    if (entry?.queue) {
        return entry.queue;
    }
    if (!entry) {
        entry = { queue: null, worker: null };
        state.byName.set(name, entry);
    }
    entry.queue = new state.bullmq.Queue(name, { connection: state.connection });
    return entry.queue;
}

async function enqueueOn(state, name, payload) {
    const queue = getOrCreateQueue(state, name);
    const job = await queue.add(name, payload, {
        attempts: state.config.maxAttempts,
        removeOnComplete: false,
        removeOnFail: false,
    });
    return { jobId: String(job.id) };
}

async function getJobOn(state, jobId) {
    // 单队列名场景：直接命中现存 Queue 实例
    for (const entry of state.byName.values()) {
        if (!entry.queue) {
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const job = await entry.queue.getJob(jobId);
        if (!job) {
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const bullState = await job.getState();
        return sanitize(job, mapStatus(bullState));
    }
    return null;
}

function registerWorkerOn(state, name, workerFn) {
    if (typeof workerFn !== 'function') {
        throw new Error('worker 必须是函数');
    }
    let entry = state.byName.get(name);
    if (!entry) {
        entry = { queue: null, worker: null };
        state.byName.set(name, entry);
    }
    if (entry.worker) {
        throw new Error(`队列 ${name} 已注册 worker（每队列名仅一个）`);
    }
    entry.worker = new state.bullmq.Worker(
        name,
        // eslint-disable-next-line require-await
        async (job) => workerFn(job.data, job),
        {
            connection: state.connection,
            concurrency: state.config.concurrency,
        },
    );
    entry.worker.on('completed', (job, result) => {
        state.completeHandlers.forEach((h) => {
            try {
                h(sanitize({ ...job, returnvalue: result, finishedOn: Date.now() }, 'SUCCESS'));
            } catch (err) {
                logger.warn({ err: err.message }, 'onJobComplete handler 抛错（忽略）');
            }
        });
    });
    entry.worker.on('failed', (job, err) => {
        if (!job) {
            return;
        }
        state.completeHandlers.forEach((h) => {
            try {
                h(sanitize({ ...job, failedReason: err?.message, finishedOn: Date.now() }, 'FAILED'));
            } catch (handlerErr) {
                logger.warn({ err: handlerErr.message }, 'onJobComplete handler 抛错（忽略）');
            }
        });
    });
}

async function closeAll(state) {
    // 顺序：worker → queue → connection；防止 worker 关闭过程中失去 redis 连接
    for (const entry of state.byName.values()) {
        if (entry.worker) {
            // eslint-disable-next-line no-await-in-loop
            await entry.worker.close();
        }
    }
    for (const entry of state.byName.values()) {
        if (entry.queue) {
            // eslint-disable-next-line no-await-in-loop
            await entry.queue.close();
        }
    }
    await state.connection.quit();
    state.byName.clear();
    state.completeHandlers.length = 0;
}

/**
 * 创建 BullMQ Driver 实例。
 *
 * @param {{ driver: 'bullmq', connectionUrl: string, concurrency: number, maxAttempts: number }} config
 */
function createBullmqAdapter(config) {
    const { bullmq, IORedis } = loadDeps();
    const connection = buildConnection(IORedis, config.connectionUrl);
    const state = {
        bullmq,
        connection,
        config,
        byName: new Map(),
        completeHandlers: [],
    };
    return {
        enqueue: (name, payload) => enqueueOn(state, name, payload),
        getJob: (jobId) => getJobOn(state, jobId),
        process: (name, worker) => registerWorkerOn(state, name, worker),
        onJobComplete: (handler) => {
            state.completeHandlers.push(handler);
        },
        close: () => closeAll(state),
    };
}

module.exports = {
    createBullmqAdapter,
    mapStatus,
    STATE_MAP,
};
