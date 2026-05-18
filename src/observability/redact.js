// [scaffold] ID: T0.4 | Date: 2026-05-18 | Description: 深度对象脱敏工具（用于 SSE 流式输出/IOOR 落库前的二次保险）
'use strict';

const REDACTED = '[REDACTED]';

// 大小写不敏感、覆盖中英文常见敏感字段
const SENSITIVE_KEYWORDS = [
    'password',
    'passwd',
    'pwd',
    'secret',
    'token',
    'apikey',
    'api[_-]?key',
    'authorization',
    'cookie',
    'bankcard',
    'bank[_-]?card',
    'idcard',
    'id[_-]?card',
    '身份证',
    '银行卡',
    '密码',
];
const SENSITIVE_KEY_PATTERN = new RegExp(`(${SENSITIVE_KEYWORDS.join('|')})`, 'i');

const MAX_DEPTH = 8;

/**
 * 递归脱敏对象/数组中的敏感字段
 * - 命中字段名 → 值替换为 [REDACTED]
 * - 字符串值不会基于内容启发式判断（避免误杀）
 * - 不修改原对象
 */
function redactSensitive(input, depth = 0) {
    if (input === null || input === undefined) {
        return input;
    }
    if (depth > MAX_DEPTH) {
        return input;
    }
    if (Array.isArray(input)) {
        return input.map((item) => redactSensitive(item, depth + 1));
    }
    if (typeof input !== 'object') {
        return input;
    }
    const out = {};
    for (const key of Object.keys(input)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            out[key] = REDACTED;
        } else {
            out[key] = redactSensitive(input[key], depth + 1);
        }
    }
    return out;
}

module.exports = { redactSensitive, SENSITIVE_KEY_PATTERN, REDACTED };
