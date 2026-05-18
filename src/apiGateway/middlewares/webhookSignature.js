// [scaffold] ID: T4.4 | Date: 2026-05-18 | Description: Webhook 签名验证（GitHub HMAC-SHA256，时间窗口防重放）
'use strict';

const crypto = require('crypto');

const { AuthError } = require('../../infrastructure/errors/AppError');

const DEFAULT_TIME_WINDOW_MS = 5 * 60 * 1000;
const SIGNATURE_HEADER = 'x-hub-signature-256';
const TIMESTAMP_HEADER = 'x-webhook-timestamp';

/**
 * @param {object} options
 * @param {string} options.secret
 * @param {number} [options.timeWindowMs] 默认 5min
 */
function createGithubSignatureMiddleware(options) {
    if (!options?.secret) {
        throw new Error('webhookSignature 缺少 secret');
    }
    const timeWindowMs = options.timeWindowMs ?? DEFAULT_TIME_WINDOW_MS;

    return (req, res, next) => {
        const rawBody = req.body;
        if (!Buffer.isBuffer(rawBody)) {
            return next(new AuthError('webhook 需要 raw body parser'));
        }
        const headerSig = req.headers[SIGNATURE_HEADER];
        if (!headerSig) {
            return next(new AuthError(`缺少 ${SIGNATURE_HEADER} 头`));
        }
        if (!verifySignature(rawBody, options.secret, headerSig)) {
            return next(new AuthError('签名不匹配'));
        }
        const tsHeader = req.headers[TIMESTAMP_HEADER];
        if (tsHeader && !isWithinTimeWindow(tsHeader, timeWindowMs)) {
            return next(new AuthError('时间戳超出允许窗口（可能为重放攻击）'));
        }
        return next();
    };
}

function verifySignature(rawBody, secret, headerSig) {
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(String(headerSig));
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(a, b);
}

function isWithinTimeWindow(tsHeader, windowMs) {
    const ts = Number(tsHeader);
    if (!Number.isFinite(ts)) {
        return false;
    }
    return Math.abs(Date.now() - ts) <= windowMs;
}

function signGithubPayload(rawBody, secret) {
    const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return `sha256=${sig}`;
}

module.exports = { createGithubSignatureMiddleware, signGithubPayload };
