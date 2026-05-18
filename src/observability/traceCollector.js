// [scaffold] ID: T5.4 | Date: 2026-05-18 | Description: 节点级 trace 采集器（startSpan/endSpan 封装持久化）
'use strict';

const { logger } = require('./logger');

function createTraceCollector(deps) {
    if (!deps?.traceRepository) {
        throw new Error('createTraceCollector 需要 traceRepository');
    }

    function startSpan({ executionId, nodeId, nodeType, attempt }) {
        if (!executionId) {
            return null;
        }
        try {
            const traceId = deps.traceRepository.insertStart({ executionId, nodeId, nodeType, attempt });
            return { traceId, startedAt: Date.now() };
        } catch (err) {
            logger.error({ err: err.message, executionId, nodeId }, 'trace start failed');
            return null;
        }
    }

    function endSpan(span, { status, output, error }) {
        if (!span?.traceId) {
            return null;
        }
        const durationMs = Date.now() - span.startedAt;
        try {
            return deps.traceRepository.finish(span.traceId, { status, output, error, durationMs });
        } catch (err) {
            logger.error({ err: err.message, traceId: span.traceId }, 'trace finish failed');
            return null;
        }
    }

    function listByExecution(executionId) {
        return deps.traceRepository.listByExecution(executionId);
    }

    return { startSpan, endSpan, listByExecution };
}

module.exports = { createTraceCollector };
