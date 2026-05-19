// [refactor] ID: V1.5-IOOR-BATCH | Date: 2026-05-20 | Description: IOOR 记录器——脱敏 + 契约校验 + 批量缓冲入队（V1.5：record 不再同步直插）
'use strict';

const crypto = require('crypto');

const { IoorWriteInputSchema } = require('./ioorSchema');
const { redactSensitive } = require('./redact');
const { logger } = require('./logger');
const { createIoorBuffer } = require('./ioorBuffer');

function generateId() {
    return `ioor_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * @param {object} deps
 * @param {{ insertMany: Function }} deps.ioorRepository
 * @param {{ recordDeadLetter: Function }} [deps.auditRepository]
 * @param {object} [deps.bufferConfig] - IoorBufferConfigSchema 入参
 */
function createIoorRecorder(deps) {
    if (!deps?.ioorRepository) {
        throw new Error('createIoorRecorder 需要 ioorRepository');
    }
    const buffer = createIoorBuffer({
        ioorRepository: deps.ioorRepository,
        auditRepository: deps.auditRepository,
        config: deps.bufferConfig,
    });

    /**
     * 记录一个 IOOR turn。
     *
     * V1.5：契约校验通过后入队批量缓冲并**立即返回** in-memory 记录，
     * 不再产生同步 SQL。契约校验失败仍即时走 audit 死信（per-record 失败留痕）。
     */
    async function record(rawInput) {
        const sanitized = applyRedaction(rawInput);
        const parsed = IoorWriteInputSchema.safeParse(sanitized);
        if (!parsed.success) {
            return await fallbackToAudit(rawInput, parsed.error, deps);
        }
        const fullRecord = {
            ...parsed.data,
            id: generateId(),
            createdAt: new Date().toISOString(),
        };
        buffer.push(fullRecord);
        return fullRecord;
    }

    return {
        record,
        // execution 完成 / 读路径 lazy flush 调用
        flush: (executionId) => (executionId ? buffer.flush(executionId) : buffer.flushAll()),
        // 受控 shutdown 调用：清定时器 + flush 全部
        close: () => buffer.close(),
        // 测试 / 可观测用
        bufferSize: () => buffer.size(),
    };
}

function applyRedaction(rawInput) {
    return {
        ...rawInput,
        input: redactSensitive(rawInput.input ?? null),
        output: rawInput.output
            ? {
                  content: typeof rawInput.output.content === 'string' ? rawInput.output.content : null,
                  reasoning_content:
                      typeof rawInput.output.reasoning_content === 'string' ? rawInput.output.reasoning_content : null,
              }
            : null,
        toolCalls: (rawInput.toolCalls || []).map((c) => ({
            toolName: c.toolName,
            arguments: redactSensitive(c.arguments || {}),
        })),
        observations: (rawInput.observations || []).map((o) => ({
            toolName: o.toolName,
            success: o.success,
            result: redactSensitive(o.result ?? null),
            error: o.error ?? null,
        })),
    };
}

function fallbackToAudit(rawInput, error, deps) {
    if (!deps.auditRepository) {
        logger.error('ioor 契约校验失败且未配置 audit 降级，原始 payload 已丢失');
        return null;
    }
    const reason = error.message || String(error);
    return deps.auditRepository.recordDeadLetter({
        source: 'ioor',
        reason,
        payload: rawInput,
    });
}

module.exports = { createIoorRecorder };
