// [test] ID: V1.1.2 | Date: 2026-05-20 | Description: timingSafeStringEqual 恒定时间比对 helper 单元测试
'use strict';

const { timingSafeStringEqual } = require('../../src/infrastructure/security/timingSafe');

describe('timingSafeStringEqual', () => {
    test('相同字符串 → true', () => {
        expect(timingSafeStringEqual('secret-token-abc', 'secret-token-abc')).toBe(true);
    });

    test('不同但等长字符串 → false', () => {
        expect(timingSafeStringEqual('aaaaaa', 'bbbbbb')).toBe(false);
    });

    test('长度不等 → false', () => {
        expect(timingSafeStringEqual('short', 'much-longer-value')).toBe(false);
    });

    test('两个空字符串 → true', () => {
        expect(timingSafeStringEqual('', '')).toBe(true);
    });

    test('一空一非空 → false', () => {
        expect(timingSafeStringEqual('', 'x')).toBe(false);
    });

    test('非字符串入参（null/undefined/number/object）一律 → false', () => {
        expect(timingSafeStringEqual(null, 'x')).toBe(false);
        expect(timingSafeStringEqual('x', undefined)).toBe(false);
        expect(timingSafeStringEqual(123, 123)).toBe(false);
        expect(timingSafeStringEqual({}, {})).toBe(false);
    });

    test('UTF-8 多字节字符正确处理', () => {
        expect(timingSafeStringEqual('令牌中文', '令牌中文')).toBe(true);
        expect(timingSafeStringEqual('令牌中文', '令牌英文')).toBe(false);
    });
});
