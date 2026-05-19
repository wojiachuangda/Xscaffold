// [test] ID: T5.1 | Date: 2026-05-19 | Description: memoryRepository 集成测试（A.1 async 契约）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildMemoryRepository } = require('../../src/memoryManager/memoryRepository');

async function bootRepo() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    return { driver, repo: buildMemoryRepository(driver) };
}

describe('memoryRepository', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await bootRepo();
    });
    afterEach(() => ctx.driver.close());

    test('insert + findById', async () => {
        const m = await ctx.repo.insert({ sessionId: 's1', role: 'user', content: 'hi' });
        expect(m.id).toMatch(/^msg_/);
        expect(m.role).toBe('user');
        expect((await ctx.repo.findById(m.id)).content).toBe('hi');
    });

    test('listRecent 时序与窗口', async () => {
        for (let i = 0; i < 5; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await ctx.repo.insert({ sessionId: 's1', role: 'user', content: `m${i}` });
        }
        const r = await ctx.repo.listRecent('s1', 3);
        expect(r).toHaveLength(3);
        // 顺序应是时间升序（最早的 3 条）
        expect(r.map((m) => m.content)).toEqual(['m2', 'm3', 'm4']);
    });

    test('listRecent 多 session 隔离', async () => {
        await ctx.repo.insert({ sessionId: 'a', role: 'user', content: 'A' });
        await ctx.repo.insert({ sessionId: 'b', role: 'user', content: 'B' });
        const a = await ctx.repo.listRecent('a', 10);
        expect(a).toHaveLength(1);
        expect(a[0].content).toBe('A');
    });

    test('tenant_id 字段持久化', async () => {
        const m = await ctx.repo.insert({ sessionId: 's', role: 'user', content: 'x', tenantId: 'tenant-1' });
        expect(m.tenantId).toBe('tenant-1');
    });

    test('metadata JSON 序列化', async () => {
        const m = await ctx.repo.insert({ sessionId: 's', role: 'assistant', content: 'y', metadata: { tokens: 12 } });
        expect(m.metadata).toEqual({ tokens: 12 });
    });

    test('deleteSession 返回行数', async () => {
        await ctx.repo.insert({ sessionId: 's', role: 'user', content: '1' });
        await ctx.repo.insert({ sessionId: 's', role: 'user', content: '2' });
        expect(await ctx.repo.deleteSession('s')).toBe(2);
        expect(await ctx.repo.listRecent('s', 10)).toEqual([]);
    });

    test('非法 role → CHECK 约束拒绝', async () => {
        await expect(ctx.repo.insert({ sessionId: 's', role: 'invalid', content: 'x' })).rejects.toThrow(/CHECK/);
    });
});
