// [refactor] ID: V1.5-B | Date: 2026-05-20 | Description: BullMQ + Redis 持久化队列适配器（per-name Queue/Worker；每实例独立 ioredis 连接；BullMQ error 事件兜底）
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
 * 为 Queue/Worker 各自建独立的 ioredis 连接（BullMQ 官方推荐：不要复用同一连接）。
 * 全部连接由 state.ownedConnections 持有，close 时统一关。
 */
function newConn(state) {
    const conn = new state.IORedis(state.config.connectionUrl, { maxRetriesPerRequest: null });
    state.ownedConnections.push(conn);
    return conn;
}

/**
 * 为 BullMQ 对象统一绑 'error' listener —— 防止 shutdown race 时
 * "Connection is closed" 之类的事件被 Node EventEmitter 当作 ERR_UNHANDLED_ERROR 抛出。
 */
function bindErrorHandler(emitter, label) {
    emitter.on('error', (err) => {
        logger.warn({ err: err?.message, label }, 'bullmq emitter error（已吸收）');
    });
}

function getOrCreateQueue(state, name) {
    let entry = state.byName.get(name);
    if (entry?.queue) {
        return entry.queue;
    }
    if (!entry) {
        entry = { queue: null, worker: null };
        state.byName.set(name, entry);
    }
    entry.queue = new state.bullmq.Queue(name, { connection: newConn(state) });
    bindErrorHandler(entry.queue, `queue:${name}`);
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

function buildCompleteSnapshot(job, extra) {
    return { ...job, ...extra };
}

function registerWorkerOn(state, name, workerFn) {
    if (typeof workerFn !== 'function') {
        throw new Error('worker 必须是函数');
    }
    // 注册 worker 隐含该 name 的 queue 必须存在 —— 否则 getJob 无法遍历到
    getOrCreateQueue(state, name);
    const entry = state.byName.get(name);
    if (entry.worker) {
        throw new Error(`队列 ${name} 已注册 worker（每队列名仅一个）`);
    }
    entry.worker = new state.bullmq.Worker(
        name,
        // eslint-disable-next-line require-await
        async (job) => workerFn(job.data, job),
        {
            connection: newConn(state),
            concurrency: state.config.concurrency,
        },
    );
    bindErrorHandler(entry.worker, `worker:${name}`);
    entry.worker.on('completed', (job, result) => {
        fanoutComplete(state, buildCompleteSnapshot(job, { returnvalue: result, finishedOn: Date.now() }), 'SUCCESS');
    });
    entry.worker.on('failed', (job, err) => {
        if (!job) {
            return;
        }
        fanoutComplete(
            state,
            buildCompleteSnapshot(job, { failedReason: err?.message, finishedOn: Date.now() }),
            'FAILED',
        );
    });
}

function fanoutComplete(state, jobSnapshot, status) {
    const payload = sanitize(jobSnapshot, status);
    state.completeHandlers.forEach((h) => {
        try {
            h(payload);
        } catch (err) {
            logger.warn({ err: err.message }, 'onJobComplete handler 抛错（忽略）');
        }
    });
}

async function closeAll(state) {
    // 顺序：worker → queue → 所有 owned ioredis 连接
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
    for (const conn of state.ownedConnections) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await conn.quit();
        } catch (_) {
            /* 已关 / 已断的连接 quit 失败可忽略 */
        }
    }
    state.byName.clear();
    state.ownedConnections.length = 0;
    state.completeHandlers.length = 0;
}

/**
 * 创建 BullMQ Driver 实例。
 *
 * @param {{ driver: 'bullmq', connectionUrl: string, concurrency: number, maxAttempts: number }} config
 */
function createBullmqAdapter(config) {
    const { bullmq, IORedis } = loadDeps();
    const state = {
        bullmq,
        IORedis,
        config,
        byName: new Map(),
        completeHandlers: [],
        ownedConnections: [],
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
