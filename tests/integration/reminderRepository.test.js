// [test] ID: PAM-5 | Date: 2026-05-19 | Description: reminderRepository 集成测试（insert + listDue 到期/状态/项目过滤）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { buildReminderRepository } = require('../../src/domain/projectAssistant/repositories/reminderRepository');
const { migrate } = require('../../src/infrastructure/database/migrate');

async function createRepo() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    return { driver, repo: buildReminderRepository(driver) };
}

describe('reminderRepository', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await createRepo();
    });
    afterEach(() => ctx.driver.close());

    test('findById 不存在返回 null', async () => {
        expect(await ctx.repo.findById('nope')).toBeNull();
    });

    test('insert 生成 reminder_ 前缀 id；初始状态 open；severity 缺省 normal', async () => {
        const r = await ctx.repo.insert({ projectId: 'p', title: '检查 smoke', dueAt: '2026-05-20T09:00:00+08:00' });
        expect(r.reminderId).toMatch(/^reminder_/);
        expect(r.status).toBe('open');
        expect(r.severity).toBe('normal');
        expect(r.content).toBeNull();
        expect(await ctx.repo.findById(r.reminderId)).toEqual(r);
    });

    test('listDue 仅返回 due_at <= before 的提醒', async () => {
        await ctx.repo.insert({ projectId: 'p', title: 'early', dueAt: '2026-05-10T00:00:00Z' });
        await ctx.repo.insert({ projectId: 'p', title: 'late', dueAt: '2026-05-25T00:00:00Z' });
        const due = await ctx.repo.listDue({ before: '2026-05-20T00:00:00Z' });
        expect(due.total).toBe(1);
        expect(due.items[0].title).toBe('early');
    });

    test('listDue 排除非 open 状态的提醒', async () => {
        await ctx.repo.insert({ projectId: 'p', title: 'open one', dueAt: '2026-05-01T00:00:00Z' });
        await ctx.driver.run(
            `INSERT INTO pa_reminders
             (reminder_id, project_id, title, content, due_at, severity, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['reminder_done', 'p', 'done one', null, '2026-05-01T00:00:00Z', 'normal', 'done', 'x', 'x'],
        );
        const due = await ctx.repo.listDue({ before: '2026-06-01T00:00:00Z' });
        expect(due.total).toBe(1);
        expect(due.items[0].title).toBe('open one');
    });

    test('listDue 按 projectId 过滤，并按 dueAt 升序', async () => {
        await ctx.repo.insert({ projectId: 'p1', title: 'b', dueAt: '2026-05-15T00:00:00Z' });
        await ctx.repo.insert({ projectId: 'p1', title: 'a', dueAt: '2026-05-05T00:00:00Z' });
        await ctx.repo.insert({ projectId: 'p2', title: 'other', dueAt: '2026-05-01T00:00:00Z' });
        const due = await ctx.repo.listDue({ before: '2026-06-01T00:00:00Z', projectId: 'p1' });
        expect(due.total).toBe(2);
        expect(due.items.map((x) => x.title)).toEqual(['a', 'b']);
    });

    test('listDue 分页', async () => {
        for (let i = 0; i < 5; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await ctx.repo.insert({ projectId: 'p', title: `r${i}`, dueAt: `2026-05-0${i + 1}T00:00:00Z` });
        }
        const page = await ctx.repo.listDue({ before: '2026-06-01T00:00:00Z', limit: 2, offset: 0 });
        expect(page.items).toHaveLength(2);
        expect(page.total).toBe(5);
    });
});
