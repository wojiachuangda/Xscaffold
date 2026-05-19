// [test] ID: PAM-3 | Date: 2026-05-19 | Description: taskRepository 集成测试（upsert 语义 + 复合主键 + 过滤分页）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { buildTaskRepository } = require('../../src/domain/projectAssistant/repositories/taskRepository');
const { migrate } = require('../../src/infrastructure/database/migrate');

async function createRepo() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    return { driver, repo: buildTaskRepository(driver) };
}

describe('taskRepository', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await createRepo();
    });
    afterEach(() => ctx.driver.close());

    test('findOne 不存在返回 null', async () => {
        expect(await ctx.repo.findOne('p', 'nope')).toBeNull();
    });

    test('upsert 首次创建带默认值', async () => {
        const t = await ctx.repo.upsert({ projectId: 'p', taskId: 't1', title: '标题' });
        expect(t.status).toBe('open');
        expect(t.priority).toBe('normal');
        expect(t.notes).toBeNull();
        expect(t.createdAt).toBeTruthy();
    });

    test('upsert 二次更新——未提供 notes 保留原值', async () => {
        await ctx.repo.upsert({ projectId: 'p', taskId: 't1', title: 'x', notes: '初始备注' });
        const t = await ctx.repo.upsert({ projectId: 'p', taskId: 't1', title: 'x', status: 'in_progress' });
        expect(t.notes).toBe('初始备注');
        expect(t.status).toBe('in_progress');
    });

    test('upsert notes 显式置 null 可清空', async () => {
        await ctx.repo.upsert({ projectId: 'p', taskId: 't1', title: 'x', notes: '有备注' });
        const t = await ctx.repo.upsert({ projectId: 'p', taskId: 't1', title: 'x', notes: null });
        expect(t.notes).toBeNull();
    });

    test('复合主键——同 taskId 不同 project 互不冲突', async () => {
        await ctx.repo.upsert({ projectId: 'p1', taskId: 'shared', title: 'A' });
        await ctx.repo.upsert({ projectId: 'p2', taskId: 'shared', title: 'B' });
        expect((await ctx.repo.findOne('p1', 'shared')).title).toBe('A');
        expect((await ctx.repo.findOne('p2', 'shared')).title).toBe('B');
    });

    test('list 过滤与分页', async () => {
        for (let i = 0; i < 4; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await ctx.repo.upsert({
                projectId: 'p',
                taskId: `t${i}`,
                title: `T${i}`,
                priority: i % 2 === 0 ? 'high' : 'low',
            });
        }
        const all = await ctx.repo.list({ projectId: 'p' });
        expect(all.total).toBe(4);
        const high = await ctx.repo.list({ projectId: 'p', priority: 'high' });
        expect(high.total).toBe(2);
        const page = await ctx.repo.list({ projectId: 'p', limit: 2, offset: 0 });
        expect(page.items).toHaveLength(2);
    });
});
