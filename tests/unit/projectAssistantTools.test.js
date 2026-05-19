// [test] ID: PAM-2 | Date: 2026-05-19 | Description: projectGetStatus / projectUpdateStatus 工具单元测试
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const projectGetStatus = require('../../src/toolRegistry/builtinTools/projectAssistant/projectGetStatus');
const projectUpdateStatus = require('../../src/toolRegistry/builtinTools/projectAssistant/projectUpdateStatus');
const { NotFoundError } = require('../../src/infrastructure/errors/AppError');

describe('project assistant tools (PAM-2)', () => {
    let driver;
    beforeEach(async () => {
        driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
    });
    afterEach(() => driver.close());

    test('projectUpdateStatus 首次调用 upsert 落库', async () => {
        const r = await projectUpdateStatus.handler(
            { projectId: 'xscaffold', phase: 'A.1', completion: 76 },
            { db: driver },
        );
        expect(r.ok).toBe(true);
        expect(r.data.projectId).toBe('xscaffold');
        expect(r.data.updatedAt).toBeTruthy();
    });

    test('projectGetStatus 读取已落库项目', async () => {
        await projectUpdateStatus.handler({ projectId: 'p1', phase: 'P', summary: 's' }, { db: driver });
        const r = await projectGetStatus.handler({ projectId: 'p1' }, { db: driver });
        expect(r.ok).toBe(true);
        expect(r.data.name).toBe('p1');
        expect(r.data.summary).toBe('s');
    });

    test('projectGetStatus 项目不存在 → NotFoundError', async () => {
        await expect(projectGetStatus.handler({ projectId: 'ghost' }, { db: driver })).rejects.toThrow(NotFoundError);
    });

    test('projectUpdateStatus paramsSchema 拒绝空 patch', () => {
        const r = projectUpdateStatus.paramsSchema.safeParse({ projectId: 'x' });
        expect(r.success).toBe(false);
    });

    test('projectUpdateStatus paramsSchema 拒绝非法 status', () => {
        const r = projectUpdateStatus.paramsSchema.safeParse({ projectId: 'x', status: 'weird' });
        expect(r.success).toBe(false);
    });

    test('projectGetStatus paramsSchema 拒绝非法 projectId 字符', () => {
        const r = projectGetStatus.paramsSchema.safeParse({ projectId: 'bad id!' });
        expect(r.success).toBe(false);
    });
});
