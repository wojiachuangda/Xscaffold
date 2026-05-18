// [scaffold] ID: T4.5 | Date: 2026-05-18 | Description: 内存队列适配器（MVP 默认）——单进程异步任务派发
'use strict';

const crypto = require('crypto');
const { EventEmitter } = require('events');

const { logger } = require('../../observability/logger');

/**
 * 队列接口契约：
 *   enqueue(name, payload) -> { jobId }
 *   getJob(jobId)          -> { id, name, status, result, error }
 *   process(name, worker)  -> 注册 worker（每队列一个）
 *   onJobComplete(handler) -> 完成回调
 *   close()                -> 释放资源
 */
function createInMemoryAdapter() {
    const state = { jobs: new Map(), workers: new Map(), events: new EventEmitter() };
    return {
        enqueue: (name, payload) => enqueueJob(state, name, payload),
        getJob: (jobId) => getJob(state, jobId),
        process: (name, worker) => registerWorker(state, name, worker),
        onJobComplete: (handler) => state.events.on('complete', handler),
        close: () => closeState(state),
    };
}

function enqueueJob(state, name, payload) {
    const id = `job_${crypto.randomBytes(8).toString('hex')}`;
    const job = { id, name, payload, status: 'PENDING', result: null, error: null, createdAt: Date.now() };
    state.jobs.set(id, job);
    setImmediate(() => runJob(state, job).catch(() => {}));
    return { jobId: id };
}

async function runJob(state, job) {
    const worker = state.workers.get(job.name);
    if (!worker) {
        failJob(state, job, new Error(`无 worker 注册到队列: ${job.name}`), 'NO_WORKER');
        return;
    }
    job.status = 'RUNNING';
    try {
        job.result = await worker(job.payload, job);
        job.status = 'SUCCESS';
    } catch (err) {
        job.status = 'FAILED';
        job.error = { message: err.message, code: err.code || 'INTERNAL_ERROR' };
        logger.warn({ jobId: job.id, err: err.message }, 'queue job failed');
    } finally {
        job.finishedAt = Date.now();
        state.events.emit('complete', sanitize(job));
    }
}

function failJob(state, job, err, code) {
    job.status = 'FAILED';
    job.error = { message: err.message, code };
    job.finishedAt = Date.now();
    state.events.emit('complete', sanitize(job));
}

function getJob(state, jobId) {
    const j = state.jobs.get(jobId);
    return j ? sanitize(j) : null;
}

function registerWorker(state, name, worker) {
    if (typeof worker !== 'function') {
        throw new Error('worker 必须是函数');
    }
    state.workers.set(name, worker);
}

function closeState(state) {
    state.jobs.clear();
    state.workers.clear();
    state.events.removeAllListeners();
}

function sanitize(job) {
    return {
        id: job.id,
        name: job.name,
        status: job.status,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
    };
}

module.exports = { createInMemoryAdapter };
