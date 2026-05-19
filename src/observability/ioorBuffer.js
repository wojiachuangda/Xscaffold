// [refactor] ID: V1.5-IOOR-BATCH | Date: 2026-05-20 | Description: IOOR 内存批量缓冲——有界窗口（条数/时间）+ 显式 flush；flush 失败整批进 audit 死信
'use strict';

const { logger } = require('./logger');
const { IoorBufferConfigSchema } = require('./schemas/ioorBufferConfigSchema');

/**
 * 入队一条 IOOR 记录（同步）。累计达 batchSize 即异步触发 flush。
 */
function pushRecord(state, record) {
    const arr = state.byExecution.get(record.executionId);
    if (arr) {
        arr.push(record);
    } else {
        state.byExecution.set(record.executionId, [record]);
    }
    state.totalSize += 1;
    if (state.totalSize >= state.config.batchSize) {
        flushAll(state).catch(() => {});
    }
}

/**
 * flush 指定 execution 的缓冲。get+delete+扣减为同步原子段，
 * 并发 flush 同一 id 时第二个会拿到空。
 */
async function flushExecution(state, executionId) {
    const batch = state.byExecution.get(executionId);
    if (!batch || batch.length === 0) {
        return { inserted: 0 };
    }
    state.byExecution.delete(executionId);
    state.totalSize -= batch.length;
    return await persist(state, batch);
}

async function flushAll(state) {
    const ids = [...state.byExecution.keys()];
    const results = await Promise.all(ids.map((id) => flushExecution(state, id)));
    return results.reduce((acc, r) => acc + (r.inserted || 0), 0);
}

async function persist(state, batch) {
    try {
        return await state.ioorRepository.insertMany(batch);
    } catch (err) {
        await deadLetterBatch(state, batch, err);
        return { inserted: 0, failed: batch.length };
    }
}

/**
 * flush 失败兜底：整批写 audit_dead_letters（D-IOOR-5）。
 * 注意：这是「flush 失败兜底」，非受控崩溃（kill -9/掉电）不在此保障内。
 */
async function deadLetterBatch(state, batch, err) {
    const reason = `ioor 批量 flush 失败: ${err.message || String(err)}`;
    if (!state.auditRepository) {
        logger.error({ count: batch.length }, `${reason}；无 audit 降级，该批记录丢失`);
        return;
    }
    try {
        await state.auditRepository.recordDeadLetter({ source: 'ioor.batch', reason, payload: batch });
    } catch (auditErr) {
        logger.error({ err: auditErr.message, count: batch.length }, 'ioor 批量死信落库亦失败');
    }
}

async function closeBuffer(state) {
    clearInterval(state.timer);
    await flushAll(state);
}

/**
 * 创建 IOOR 批量缓冲。
 *
 * 触发 flush 的 5 个时机（PLAN_V1.5-IOOR-BATCH §3b）：
 * size / time / execution 完成 / 读路径 lazy / 受控 shutdown。
 *
 * @param {object} deps
 * @param {{ insertMany: Function }} deps.ioorRepository
 * @param {{ recordDeadLetter: Function }} [deps.auditRepository]
 * @param {object} [deps.config] - IoorBufferConfigSchema 入参
 */
function createIoorBuffer(deps) {
    if (!deps?.ioorRepository) {
        throw new Error('createIoorBuffer 需要 ioorRepository');
    }
    const config = IoorBufferConfigSchema.parse(deps.config || {});
    const state = {
        ioorRepository: deps.ioorRepository,
        auditRepository: deps.auditRepository,
        config,
        byExecution: new Map(),
        totalSize: 0,
        timer: null,
    };
    // 定时 flush；unref 不阻塞进程退出，受控 shutdown 由 close() 显式 flush
    state.timer = setInterval(() => {
        flushAll(state).catch(() => {});
    }, config.intervalMs);
    state.timer.unref();

    return {
        push: (record) => pushRecord(state, record),
        flush: (executionId) => flushExecution(state, executionId),
        flushAll: () => flushAll(state),
        close: () => closeBuffer(state),
        size: () => state.totalSize,
    };
}

module.exports = { createIoorBuffer };
