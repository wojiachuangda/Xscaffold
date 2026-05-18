// [scaffold] ID: V1.1-2 | Date: 2026-05-19 | Description: 工作流 Token 配额熔断（不计 cached；超额抛 TokenQuotaError）
'use strict';

const { AppError } = require('../infrastructure/errors/AppError');

const DEFAULT_QUOTA = Number(process.env.WORKFLOW_TOKEN_QUOTA) || 100000;

class TokenQuotaError extends AppError {
    constructor(message, details) {
        super(message, { code: 'TOKEN_QUOTA_EXCEEDED', status: 500, details });
    }
}

/**
 * 创建一个 quota 计数器并挂载到 ctx 上
 * 调用次序：
 *   1) initQuota(ctx, quota)  在 executor.execute 入口
 *   2) assertBeforeCall(ctx)  每次 LLM 调用前
 *   3) recordTokens(ctx, usage)  LLM 调用后
 *
 * cached_prompt_tokens 不计入配额（仅作分析指标）
 */
function initQuota(ctx, quota) {
    if (!ctx || typeof ctx !== 'object') {
        return;
    }
    if (ctx._tokenQuota) {
        return; // 已初始化
    }
    const limit = Number.isFinite(quota) && quota > 0 ? quota : DEFAULT_QUOTA;
    Object.defineProperty(ctx, '_tokenQuota', {
        value: { limit, used: 0, callCount: 0 },
        writable: false,
        enumerable: false,
    });
}

function snapshot(ctx) {
    if (!ctx?._tokenQuota) {
        return null;
    }
    const { limit, used, callCount } = ctx._tokenQuota;
    return { limit, used, callCount, remaining: Math.max(0, limit - used) };
}

function assertBeforeCall(ctx) {
    if (!ctx?._tokenQuota) {
        return;
    }
    const { limit, used } = ctx._tokenQuota;
    if (used >= limit) {
        throw new TokenQuotaError(`Token 配额已耗尽（${used}/${limit}）`, snapshot(ctx));
    }
}

function recordTokens(ctx, tokenUsage) {
    if (!ctx?._tokenQuota || !tokenUsage) {
        return;
    }
    const billed = computeBilledTokens(tokenUsage);
    ctx._tokenQuota.used += billed;
    ctx._tokenQuota.callCount += 1;
}

function computeBilledTokens(usage) {
    const total = Number(usage.total) || 0;
    const cached = Number(usage.cached_prompt_tokens) || 0;
    // 不计 cached（已折扣）；保守取 max(0, total - cached)
    return Math.max(0, total - cached);
}

module.exports = {
    initQuota,
    snapshot,
    assertBeforeCall,
    recordTokens,
    TokenQuotaError,
    DEFAULT_QUOTA,
};
