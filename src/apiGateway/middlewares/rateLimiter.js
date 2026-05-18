// [scaffold] ID: T4.2 | Date: 2026-05-18 | Description: 滑动窗口内存限流中间件（IP/sub 双粒度，超限返回 429+Retry-After）
'use strict';

const { RateLimitError } = require('../../infrastructure/errors/AppError');

const DEFAULT_WINDOW_MS = 60000;

/**
 * @param {object} options
 * @param {number} [options.max]        每窗口最大次数，默认 RATE_LIMIT_PER_MINUTE 或 60
 * @param {number} [options.windowMs]   时间窗，默认 60000
 * @param {boolean} [options.bypass]    测试期完全跳过
 * @param {(req)=>string} [options.keyFn] 自定义计数键（默认：req.user.sub || req.ip）
 */
function createRateLimiter(options = {}) {
    const config = resolveConfig(options);
    const buckets = new Map();

    return (req, res, next) => {
        if (config.bypass) {
            return next();
        }
        const key = config.keyFn(req);
        const now = Date.now();
        const bucket = pruneBucket(buckets, key, now, config.windowMs);
        if (bucket.length >= config.max) {
            const retryAfterMs = config.windowMs - (now - bucket[0]);
            res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
            return next(new RateLimitError(`请求过于频繁，请 ${Math.ceil(retryAfterMs / 1000)}s 后重试`));
        }
        bucket.push(now);
        return next();
    };
}

function resolveConfig(options) {
    return {
        max: options.max ?? Number(process.env.RATE_LIMIT_PER_MINUTE) ?? 60,
        windowMs: options.windowMs ?? DEFAULT_WINDOW_MS,
        bypass: options.bypass ?? false,
        keyFn: options.keyFn ?? defaultKey,
    };
}

function defaultKey(req) {
    return req.user?.sub || req.ip || 'unknown';
}

function pruneBucket(buckets, key, now, windowMs) {
    const cutoff = now - windowMs;
    const existing = buckets.get(key) || [];
    const fresh = existing.filter((t) => t > cutoff);
    buckets.set(key, fresh);
    return fresh;
}

module.exports = { createRateLimiter };
