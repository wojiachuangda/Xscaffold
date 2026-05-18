// [test] ID: T0.4 | Date: 2026-05-18 | Description: 脱敏工具单元测试
'use strict';

const { redactSensitive, SENSITIVE_KEY_PATTERN, REDACTED } = require('../../src/observability/redact');

describe('redactSensitive', () => {
    test('顶层敏感字段被替换', () => {
        const input = { username: 'alice', password: 'p@ss', token: 'abc' };
        expect(redactSensitive(input)).toEqual({
            username: 'alice',
            password: REDACTED,
            token: REDACTED,
        });
    });

    test('嵌套对象同样被脱敏', () => {
        const input = { user: { name: 'bob', apiKey: 'k' } };
        expect(redactSensitive(input)).toEqual({ user: { name: 'bob', apiKey: REDACTED } });
    });

    test('数组中的对象被递归脱敏', () => {
        const input = [{ secret: 's' }, { ok: 1 }];
        expect(redactSensitive(input)).toEqual([{ secret: REDACTED }, { ok: 1 }]);
    });

    test('不修改原对象（immutability）', () => {
        const input = { password: 'x' };
        const copy = JSON.parse(JSON.stringify(input));
        redactSensitive(input);
        expect(input).toEqual(copy);
    });

    test('原始类型与 null 原样返回', () => {
        expect(redactSensitive(null)).toBeNull();
        expect(redactSensitive(undefined)).toBeUndefined();
        expect(redactSensitive('abc')).toBe('abc');
        expect(redactSensitive(42)).toBe(42);
        expect(redactSensitive(true)).toBe(true);
    });

    test('深度过深时截断（不抛错）', () => {
        let nested = { v: 1 };
        for (let i = 0; i < 50; i += 1) {
            nested = { child: nested };
        }
        expect(() => redactSensitive(nested)).not.toThrow();
    });

    test('字段名大小写不敏感', () => {
        const input = { Password: 'x', AUTHORIZATION: 'y', api_key: 'z' };
        const out = redactSensitive(input);
        expect(out.Password).toBe(REDACTED);
        expect(out.AUTHORIZATION).toBe(REDACTED);
        expect(out.api_key).toBe(REDACTED);
    });

    test('中文敏感字段（身份证/银行卡/密码）被脱敏', () => {
        const input = { 身份证: '11010119900101001X', 银行卡: '6228...', 密码: 'x' };
        const out = redactSensitive(input);
        expect(out['身份证']).toBe(REDACTED);
        expect(out['银行卡']).toBe(REDACTED);
        expect(out['密码']).toBe(REDACTED);
    });

    test('非敏感字段含敏感值不被误杀', () => {
        const input = { description: 'this password is hard to guess' };
        expect(redactSensitive(input).description).toBe('this password is hard to guess');
    });
});

describe('SENSITIVE_KEY_PATTERN', () => {
    test('能匹配常见变体', () => {
        ['password', 'API_KEY', 'apiKey', 'Authorization', 'bank_card', 'idCard', '密码'].forEach((k) =>
            expect(SENSITIVE_KEY_PATTERN.test(k)).toBe(true),
        );
    });

    test('普通字段不命中', () => {
        ['username', 'email', 'description', 'tokenizer'].forEach((k) => {
            // tokenizer 含 'token' 子串 → 命中是预期（保守策略）
            if (k === 'tokenizer') {
                expect(SENSITIVE_KEY_PATTERN.test(k)).toBe(true);
                return;
            }
            expect(SENSITIVE_KEY_PATTERN.test(k)).toBe(false);
        });
    });
});
