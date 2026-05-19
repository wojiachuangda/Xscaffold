// [scaffold] ID: T5.3 | Date: 2026-05-18 | Description: IOOR 记录器——脱敏 + 契约校验 + 审计降级
'use strict';

const { IoorWriteInputSchema } = require('./ioorSchema');
const { redactSensitive } = require('./redact');
const { logger } = require('./logger');

/**
 * @param {object} deps
 * @param {import('./ioorRepository').buildIoorRepository} deps.ioorRepository
 * @param {import('../domain/audit/auditRepository').buildAuditRepository} deps.auditRepository
 */
function createIoorRecorder(deps) {
    if (!deps?.ioorRepository) {
        throw new Error('createIoorRecorder 需要 ioorRepository');
    }

    async function record(rawInput) {
        const sanitized = applyRedaction(rawInput);
        const parsed = IoorWriteInputSchema.safeParse(sanitized);
        if (!parsed.success) {
            return fallbackToAudit(rawInput, parsed.error, deps);
        }
        try {
            return await deps.ioorRepository.insert(parsed.data);
        } catch (err) {
            logger.error({ err: err.message }, 'ioor insert failed, falling back to audit');
            return fallbackToAudit(rawInput, err, deps);
        }
    }

    return { record };
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
        logger.error('ioor 落库失败且未配置 audit 降级，原始 payload 已丢失');
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
