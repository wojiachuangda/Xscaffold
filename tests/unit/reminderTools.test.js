// [test] ID: PAM-5 | Date: 2026-05-19 | Description: reminderCreate / reminderListDue 工具单元测试
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const reminderCreate = require('../../src/toolRegistry/builtinTools/projectAssistant/reminderCreate');
const reminderListDue = require('../../src/toolRegistry/builtinTools/projectAssistant/reminderListDue');

describe('reminder tools (PAM-5)', () => {
    let driver;
    beforeEach(async () => {
        driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
    });
    afterEach(() => driver.close());

    test('reminderCreate 返回 reminderId', async () => {
        const r = await reminderCreate.handler(
            { projectId: 'p', title: '检查 smoke', dueAt: '2026-05-20T09:00:00+08:00' },
            { db: driver },
        );
        expect(r.ok).toBe(true);
        expect(r.data.reminderId).toMatch(/^reminder_/);
    });

    test('reminderListDue 返回到期提醒 items/total', async () => {
        await reminderCreate.handler({ projectId: 'p', title: 'early', dueAt: '2026-05-10T00:00:00Z' }, { db: driver });
        await reminderCreate.handler({ projectId: 'p', title: 'late', dueAt: '2026-05-25T00:00:00Z' }, { db: driver });
        const r = await reminderListDue.handler({ before: '2026-05-20T00:00:00Z' }, { db: driver });
        expect(r.ok).toBe(true);
        expect(r.data.total).toBe(1);
        expect(r.data.items[0].title).toBe('early');
    });

    test('reminderListDue 按 projectId 过滤', async () => {
        await reminderCreate.handler({ projectId: 'p1', title: 'A', dueAt: '2026-05-01T00:00:00Z' }, { db: driver });
        await reminderCreate.handler({ projectId: 'p2', title: 'B', dueAt: '2026-05-01T00:00:00Z' }, { db: driver });
        const r = await reminderListDue.handler({ before: '2026-06-01T00:00:00Z', projectId: 'p1' }, { db: driver });
        expect(r.data.total).toBe(1);
        expect(r.data.items[0].title).toBe('A');
    });

    test('reminderCreate paramsSchema 拒绝缺 dueAt', () => {
        const r = reminderCreate.paramsSchema.safeParse({ projectId: 'p', title: 't' });
        expect(r.success).toBe(false);
    });

    test('reminderCreate paramsSchema 拒绝非 ISO dueAt', () => {
        const r = reminderCreate.paramsSchema.safeParse({ projectId: 'p', title: 't', dueAt: '2026/05/20' });
        expect(r.success).toBe(false);
    });

    test('reminderListDue paramsSchema 拒绝缺 before', () => {
        const r = reminderListDue.paramsSchema.safeParse({ projectId: 'p' });
        expect(r.success).toBe(false);
    });
});
