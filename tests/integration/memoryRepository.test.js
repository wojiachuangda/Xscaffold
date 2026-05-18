// [test] ID: T5.1 | Date: 2026-05-18 | Description: memoryRepository 集成测试
'use strict';

const Database = require('better-sqlite3');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildMemoryRepository } = require('../../src/memoryManager/memoryRepository');

function bootRepo() {
    const db = new Database(':memory:');
    migrate({ db });
    return { db, repo: buildMemoryRepository(db) };
}

describe('memoryRepository', () => {
    let ctx;
    beforeEach(() => {
        ctx = bootRepo();
    });
    afterEach(() => ctx.db.close());

    test('insert + findById', () => {
        const m = ctx.repo.insert({ sessionId: 's1', role: 'user', content: 'hi' });
        expect(m.id).toMatch(/^msg_/);
        expect(m.role).toBe('user');
        expect(ctx.repo.findById(m.id).content).toBe('hi');
    });

    test('listRecent 时序与窗口', () => {
        for (let i = 0; i < 5; i += 1) {
            ctx.repo.insert({ sessionId: 's1', role: 'user', content: `m${i}` });
        }
        const r = ctx.repo.listRecent('s1', 3);
        expect(r).toHaveLength(3);
        // 顺序应是时间升序（最早的 3 条）
        expect(r.map((m) => m.content)).toEqual(['m2', 'm3', 'm4']);
    });

    test('listRecent 多 session 隔离', () => {
        ctx.repo.insert({ sessionId: 'a', role: 'user', content: 'A' });
        ctx.repo.insert({ sessionId: 'b', role: 'user', content: 'B' });
        const a = ctx.repo.listRecent('a', 10);
        expect(a).toHaveLength(1);
        expect(a[0].content).toBe('A');
    });

    test('tenant_id 字段持久化', () => {
        const m = ctx.repo.insert({ sessionId: 's', role: 'user', content: 'x', tenantId: 'tenant-1' });
        expect(m.tenantId).toBe('tenant-1');
    });

    test('metadata JSON 序列化', () => {
        const m = ctx.repo.insert({ sessionId: 's', role: 'assistant', content: 'y', metadata: { tokens: 12 } });
        expect(m.metadata).toEqual({ tokens: 12 });
    });

    test('deleteSession 返回行数', () => {
        ctx.repo.insert({ sessionId: 's', role: 'user', content: '1' });
        ctx.repo.insert({ sessionId: 's', role: 'user', content: '2' });
        expect(ctx.repo.deleteSession('s')).toBe(2);
        expect(ctx.repo.listRecent('s', 10)).toEqual([]);
    });

    test('非法 role → CHECK 约束拒绝', () => {
        expect(() => ctx.repo.insert({ sessionId: 's', role: 'invalid', content: 'x' })).toThrow(/CHECK/);
    });
});
