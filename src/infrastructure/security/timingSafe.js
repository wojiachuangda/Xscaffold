// [refactor] ID: V1.1.2 | Date: 2026-05-20 | Description: 恒定时间字符串比对 helper——webhook 签名与 metrics token 共用，杜绝时序侧信道
'use strict';

const crypto = require('crypto');

/**
 * 恒定时间比较两个字符串是否相等。
 *
 * 设计：
 * - 任一非字符串 → 直接 false（不抛错，调用方无需预校验类型）
 * - 长度不等 → 直接 false。注意这一步本身会泄漏「长度是否相等」，
 *   但对 token / HMAC 摘要这类长度固定的密钥场景无实际风险；
 *   crypto.timingSafeEqual 要求入参等长，否则抛错，故必须前置长度判断。
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function timingSafeStringEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
        return false;
    }
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) {
        return false;
    }
    return crypto.timingSafeEqual(ab, bb);
}

module.exports = { timingSafeStringEqual };
