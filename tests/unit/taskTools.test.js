// [test] ID: PAM-3 | Date: 2026-05-19 | Description: taskList / taskUpsert 工具单元测试
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const taskList = require('../../src/toolRegistry/builtinTools/projectAssistant/taskList');
const taskUpsert = require('../../src/toolRegistry/builtinTools/projectAssistant/taskUpsert');

describe('task tools (PAM-3)', () => {
    let driver;
    beforeEach(async () => {
        driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
    });
    afterEach(() => driver.close());

    test('taskUpsert 创建任务', async () => {
        const r = await taskUpsert.handler({ projectId: 'p', taskId: 't1', title: '实现闭环' }, { db: driver });
        expect(r.ok).toBe(true);
        expect(r.data.taskId).toBe('t1');
        expect(r.data.updatedAt).toBeTruthy();
    });

    test('taskUpsert 二次调用更新同一任务', async () => {
        await taskUpsert.handler({ projectId: 'p', taskId: 't1', title: '旧标题' }, { db: driver });
        await taskUpsert.handler({ projectId: 'p', taskId: 't1', title: '新标题', status: 'done' }, { db: driver });
        const r = await taskList.handler({ projectId: 'p' }, { db: driver });
        expect(r.data.total).toBe(1);
        expect(r.data.items[0].title).toBe('新标题');
        expect(r.data.items[0].status).toBe('done');
    });

    test('taskList 按 status 过滤', async () => {
        await taskUpsert.handler({ projectId: 'p', taskId: 'a', title: 'A', status: 'open' }, { db: driver });
        await taskUpsert.handler({ projectId: 'p', taskId: 'b', title: 'B', status: 'done' }, { db: driver });
        const open = await taskList.handler({ projectId: 'p', status: 'open' }, { db: driver });
        expect(open.data.total).toBe(1);
        expect(open.data.items[0].taskId).toBe('a');
    });

    test('taskList 项目隔离', async () => {
        await taskUpsert.handler({ projectId: 'p1', taskId: 'x', title: 'X' }, { db: driver });
        await taskUpsert.handler({ projectId: 'p2', taskId: 'y', title: 'Y' }, { db: driver });
        const r = await taskList.handler({ projectId: 'p1' }, { db: driver });
        expect(r.data.total).toBe(1);
        expect(r.data.items[0].taskId).toBe('x');
    });

    test('taskList 分页', async () => {
        for (let i = 0; i < 5; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await taskUpsert.handler({ projectId: 'p', taskId: `t${i}`, title: `T${i}` }, { db: driver });
        }
        const page = await taskList.handler({ projectId: 'p', limit: 2, offset: 0 }, { db: driver });
        expect(page.data.items).toHaveLength(2);
        expect(page.data.total).toBe(5);
    });

    test('taskUpsert paramsSchema 拒绝缺 title', () => {
        const r = taskUpsert.paramsSchema.safeParse({ projectId: 'p', taskId: 't' });
        expect(r.success).toBe(false);
    });

    test('taskUpsert paramsSchema 拒绝非法 priority', () => {
        const r = taskUpsert.paramsSchema.safeParse({ projectId: 'p', taskId: 't', title: 'x', priority: 'meh' });
        expect(r.success).toBe(false);
    });
});
