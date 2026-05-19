// [test] ID: PAM-2 | Date: 2026-05-19 | Description: projectRepository 集成测试（upsert 语义 + Q13 name 兜底）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { buildProjectRepository } = require('../../src/domain/projectAssistant/repositories/projectRepository');
const { migrate } = require('../../src/infrastructure/database/migrate');

async function createRepo() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    return { driver, repo: buildProjectRepository(driver) };
}

describe('projectRepository', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await createRepo();
    });
    afterEach(() => ctx.driver.close());

    test('getByProjectId 不存在返回 null', async () => {
        expect(await ctx.repo.getByProjectId('nope')).toBeNull();
    });

    test('upsertStatus 首次落库——name 兜底取 projectId（Q13）', async () => {
        const p = await ctx.repo.upsertStatus('xscaffold', { phase: 'A.1', completion: 76 });
        expect(p.projectId).toBe('xscaffold');
        expect(p.name).toBe('xscaffold');
        expect(p.phase).toBe('A.1');
        expect(p.completion).toBe(76);
        expect(p.status).toBe('active');
        expect(p.health).toBe('green');
        expect(p.summary).toBe('');
        expect(p.createdAt).toBeTruthy();
    });

    test('upsertStatus 二次调用只更新白名单字段，不改 name', async () => {
        await ctx.repo.upsertStatus('xscaffold', { phase: 'A.1' });
        await new Promise((r) => setTimeout(r, 5));
        const p = await ctx.repo.upsertStatus('xscaffold', { status: 'blocked', health: 'red' });
        expect(p.name).toBe('xscaffold');
        expect(p.phase).toBe('A.1');
        expect(p.status).toBe('blocked');
        expect(p.health).toBe('red');
    });

    test('upsertStatus 部分字段——未提供的保持原值', async () => {
        await ctx.repo.upsertStatus('demo', { phase: 'P1', completion: 10, summary: 's1' });
        const p = await ctx.repo.upsertStatus('demo', { completion: 50 });
        expect(p.phase).toBe('P1');
        expect(p.summary).toBe('s1');
        expect(p.completion).toBe(50);
    });

    test('upsertStatus updatedAt 变化而 createdAt 保持', async () => {
        const a = await ctx.repo.upsertStatus('t', { phase: 'x' });
        await new Promise((r) => setTimeout(r, 5));
        const b = await ctx.repo.upsertStatus('t', { phase: 'y' });
        expect(b.updatedAt).not.toBe(a.updatedAt);
        expect(b.createdAt).toBe(a.createdAt);
    });
});
