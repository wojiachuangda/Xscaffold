// [test] ID: V2.6-LONG-SESSION | Date: 2026-05-22 | Description: conversationContext 单元——截断二者取严 / 降级 / 归属 404 / 指标
'use strict';

const {
    loadHistory,
    assertSessionOwnership,
    loadHistoryConfig,
    estimateTokens,
    trimToTokenBudget,
} = require('../../src/memoryManager/conversationContext');
const { NotFoundError } = require('../../src/infrastructure/errors/AppError');

function fakeMetrics() {
    return {
        loaded: [],
        truncated: 0,
        observeHistoryLoaded(n) {
            this.loaded.push(n);
        },
        incrHistoryTruncated() {
            this.truncated += 1;
        },
    };
}

function entities(n, contentLen = 4) {
    return Array.from({ length: n }, (_v, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'x'.repeat(contentLen),
    }));
}

describe('conversationContext', () => {
    describe('loadHistoryConfig', () => {
        test('env 未设 → 默认 20 / 8000', () => {
            expect(loadHistoryConfig({})).toEqual({ maxMessages: 20, maxTokens: 8000 });
        });
        test('env 覆盖（字符串强转）', () => {
            const cfg = loadHistoryConfig({ AGENT_HISTORY_MAX_MESSAGES: '5', AGENT_HISTORY_MAX_TOKENS: '500' });
            expect(cfg).toEqual({ maxMessages: 5, maxTokens: 500 });
        });
        test('空串视为未设 → 回默认', () => {
            expect(loadHistoryConfig({ AGENT_HISTORY_MAX_MESSAGES: '' }).maxMessages).toBe(20);
        });
    });

    describe('trimToTokenBudget', () => {
        test('从最旧端丢弃直到 token ≤ 预算', () => {
            // 每条 estimateTokens = 4(overhead) + ceil(8/4)=2 → 6 tokens；3 条=18
            const msgs = entities(3, 8);
            const kept = trimToTokenBudget(msgs, 12); // 预算 12 → 只能留 2 条(12)
            expect(kept).toHaveLength(2);
        });
        test('预算充足 → 全保留', () => {
            expect(trimToTokenBudget(entities(3, 4), 10000)).toHaveLength(3);
        });
    });

    describe('estimateTokens', () => {
        test('空内容只算固定开销', () => {
            expect(estimateTokens('')).toBe(4);
            expect(estimateTokens(null)).toBe(4);
        });
    });

    describe('assertSessionOwnership', () => {
        test('无 memoryStore / 无 sessionId → 放行', async () => {
            await expect(assertSessionOwnership({})).resolves.toBeUndefined();
        });
        test('session 无主（null）→ 放行（可认领）', async () => {
            const memoryStore = { getSessionOwner: jest.fn().mockResolvedValue(null) };
            await expect(
                assertSessionOwnership({ memoryStore, sessionId: 's', ownerId: 'u1' }),
            ).resolves.toBeUndefined();
        });
        test('归属本人 → 放行', async () => {
            const memoryStore = { getSessionOwner: jest.fn().mockResolvedValue('u1') };
            await expect(
                assertSessionOwnership({ memoryStore, sessionId: 's', ownerId: 'u1' }),
            ).resolves.toBeUndefined();
        });
        test('跨用户 → NotFoundError(404)', async () => {
            const memoryStore = { getSessionOwner: jest.fn().mockResolvedValue('u1') };
            await expect(assertSessionOwnership({ memoryStore, sessionId: 's', ownerId: 'u2' })).rejects.toThrow(
                NotFoundError,
            );
        });
    });

    describe('loadHistory', () => {
        test('无 sessionId → 空数组，不触 store', async () => {
            const memoryStore = { getHistory: jest.fn(), countSession: jest.fn() };
            expect(await loadHistory({ memoryStore, sessionId: undefined, ownerId: 'u1' })).toEqual([]);
            expect(memoryStore.getHistory).not.toHaveBeenCalled();
        });

        test('映射 {role,content} + 记录 loaded 指标', async () => {
            const memoryStore = {
                getHistory: jest.fn().mockResolvedValue(entities(3, 4)),
                countSession: jest.fn().mockResolvedValue(3),
            };
            const metrics = fakeMetrics();
            const out = await loadHistory({
                memoryStore,
                sessionId: 's',
                ownerId: 'u1',
                config: { maxMessages: 20, maxTokens: 8000 },
                metrics,
            });
            expect(out).toHaveLength(3);
            expect(out[0]).toEqual({ role: 'user', content: 'xxxx' });
            expect(metrics.loaded).toEqual([3]);
            expect(metrics.truncated).toBe(0);
        });

        test('截断（total > 窗口）→ truncated 指标 +1', async () => {
            const memoryStore = {
                getHistory: jest.fn().mockResolvedValue(entities(20, 4)), // 窗口拿到 20
                countSession: jest.fn().mockResolvedValue(80), // 实际 80 → 丢 60
            };
            const metrics = fakeMetrics();
            const out = await loadHistory({
                memoryStore,
                sessionId: 's',
                ownerId: 'u1',
                config: { maxMessages: 20, maxTokens: 8000 },
                metrics,
            });
            expect(out).toHaveLength(20);
            expect(metrics.truncated).toBe(1);
        });

        test('getHistory 抛错 → 降级 []（不阻断）', async () => {
            const memoryStore = {
                getHistory: jest.fn().mockRejectedValue(new Error('db down')),
                countSession: jest.fn().mockResolvedValue(0),
            };
            const out = await loadHistory({ memoryStore, sessionId: 's', ownerId: 'u1' });
            expect(out).toEqual([]);
        });
    });
});
