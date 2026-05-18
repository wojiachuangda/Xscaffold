// [test] ID: V1.1-2 | Date: 2026-05-19 | Description: Token 配额单元测试
'use strict';

const {
    initQuota,
    snapshot,
    assertBeforeCall,
    recordTokens,
    TokenQuotaError,
} = require('../../src/workflowEngine/tokenQuota');

describe('initQuota', () => {
    test('设置默认 limit', () => {
        const ctx = {};
        initQuota(ctx, 1000);
        expect(snapshot(ctx)).toEqual({ limit: 1000, used: 0, callCount: 0, remaining: 1000 });
    });

    test('重复 init 不覆盖', () => {
        const ctx = {};
        initQuota(ctx, 100);
        initQuota(ctx, 999);
        expect(snapshot(ctx).limit).toBe(100);
    });

    test('quota 缺省时使用默认值', () => {
        const ctx = {};
        initQuota(ctx);
        expect(snapshot(ctx).limit).toBeGreaterThan(0);
    });

    test('null ctx no-op', () => {
        expect(() => initQuota(null, 100)).not.toThrow();
    });

    test('_tokenQuota 不出现在枚举属性', () => {
        const ctx = {};
        initQuota(ctx, 100);
        expect(Object.keys(ctx)).not.toContain('_tokenQuota');
    });
});

describe('recordTokens / assertBeforeCall', () => {
    test('累计 total（含 cached 折扣）', () => {
        const ctx = {};
        initQuota(ctx, 100);
        recordTokens(ctx, { total: 30, cached_prompt_tokens: 10 });
        expect(snapshot(ctx).used).toBe(20);
        expect(snapshot(ctx).callCount).toBe(1);
    });

    test('多次累加', () => {
        const ctx = {};
        initQuota(ctx, 100);
        recordTokens(ctx, { total: 10 });
        recordTokens(ctx, { total: 15, cached_prompt_tokens: 5 });
        expect(snapshot(ctx).used).toBe(20);
        expect(snapshot(ctx).callCount).toBe(2);
    });

    test('used >= limit → assertBeforeCall 抛 TokenQuotaError', () => {
        const ctx = {};
        initQuota(ctx, 50);
        recordTokens(ctx, { total: 60 });
        expect(() => assertBeforeCall(ctx)).toThrow(TokenQuotaError);
    });

    test('错误 code 为 TOKEN_QUOTA_EXCEEDED', () => {
        const ctx = {};
        initQuota(ctx, 1);
        recordTokens(ctx, { total: 5 });
        try {
            assertBeforeCall(ctx);
        } catch (e) {
            expect(e.code).toBe('TOKEN_QUOTA_EXCEEDED');
            expect(e.details).toEqual(expect.objectContaining({ limit: 1, used: 5 }));
        }
    });

    test('ctx 无 _tokenQuota → assert/record 为 no-op', () => {
        const ctx = {};
        expect(() => assertBeforeCall(ctx)).not.toThrow();
        expect(() => recordTokens(ctx, { total: 1000 })).not.toThrow();
    });

    test('tokenUsage 为 null → record no-op', () => {
        const ctx = {};
        initQuota(ctx, 100);
        recordTokens(ctx, null);
        expect(snapshot(ctx).used).toBe(0);
    });

    test('snapshot 返回 remaining', () => {
        const ctx = {};
        initQuota(ctx, 100);
        recordTokens(ctx, { total: 40 });
        expect(snapshot(ctx).remaining).toBe(60);
    });
});
