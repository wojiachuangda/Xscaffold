// [test] ID: PAM-7 | Date: 2026-05-19 | Description: projectGenerateDigest 集成测试（4 个 repo 串联 + markdown/json + range 过滤 + NotFound）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const projectUpdateStatus = require('../../src/toolRegistry/builtinTools/projectAssistant/projectUpdateStatus');
const taskUpsert = require('../../src/toolRegistry/builtinTools/projectAssistant/taskUpsert');
const eventRecord = require('../../src/toolRegistry/builtinTools/projectAssistant/eventRecord');
const reminderCreate = require('../../src/toolRegistry/builtinTools/projectAssistant/reminderCreate');
const projectGenerateDigest = require('../../src/toolRegistry/builtinTools/projectAssistant/projectGenerateDigest');
const { NotFoundError } = require('../../src/infrastructure/errors/AppError');

async function seedSampleProject(driver) {
    await projectUpdateStatus.handler(
        { projectId: 'xscaffold', phase: 'A.1', status: 'active', health: 'green', completion: 70, summary: 'OK' },
        { db: driver },
    );
    await taskUpsert.handler(
        { projectId: 'xscaffold', taskId: 't1', title: '实现 demo', status: 'open', priority: 'high' },
        { db: driver },
    );
    await taskUpsert.handler(
        { projectId: 'xscaffold', taskId: 't2', title: '收口', status: 'done', priority: 'normal' },
        { db: driver },
    );
    await eventRecord.handler(
        { projectId: 'xscaffold', type: 'ci_passed', title: 'CI 全绿', severity: 'high' },
        { db: driver },
    );
    // 一个未来 24h 内到期的提醒
    const dueSoon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await reminderCreate.handler({ projectId: 'xscaffold', title: '跑 smoke', dueAt: dueSoon }, { db: driver });
}

describe('projectGenerateDigest (PAM-7)', () => {
    let driver;
    beforeEach(async () => {
        driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
        await seedSampleProject(driver);
    });
    afterEach(() => driver.close());

    test('format=markdown 返回 markdown 字符串', async () => {
        const r = await projectGenerateDigest.handler(
            { projectId: 'xscaffold', range: 'daily', format: 'markdown' },
            { db: driver },
        );
        expect(r.ok).toBe(true);
        expect(typeof r.data.digest).toBe('string');
        expect(r.data.digest).toContain('# 项目摘要：xscaffold');
        expect(r.data.digest).toContain('CI 全绿');
        expect(r.data.digest).toContain('跑 smoke');
    });

    test('format=json 返回 DigestJsonSchema 形状', async () => {
        const r = await projectGenerateDigest.handler(
            { projectId: 'xscaffold', range: 'daily', format: 'json' },
            { db: driver },
        );
        const d = r.data.digest;
        expect(d.project.projectId).toBe('xscaffold');
        expect(d.tasks.total).toBe(2);
        expect(d.tasks.open).toBe(1);
        expect(d.recentEvents).toHaveLength(1);
        expect(d.dueReminders).toHaveLength(1);
        expect(d.range).toBe('daily');
        expect(d.generatedAt).toMatch(/^2/u);
    });

    test('range=daily 排除 24h 前的旧事件', async () => {
        // 直接造一条 25h 前的事件
        const oldIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        await driver.run(
            `INSERT INTO pa_events (event_id, project_id, type, title, content, severity, created_at)
             VALUES (?, ?, ?, ?, NULL, 'normal', ?)`,
            ['event_old', 'xscaffold', 'note', '远古事件', oldIso],
        );
        const r = await projectGenerateDigest.handler(
            { projectId: 'xscaffold', range: 'daily', format: 'json' },
            { db: driver },
        );
        const titles = r.data.digest.recentEvents.map((e) => e.title);
        expect(titles).not.toContain('远古事件');
        expect(titles).toContain('CI 全绿');
    });

    test('range=all 不过滤事件', async () => {
        const oldIso = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        await driver.run(
            `INSERT INTO pa_events (event_id, project_id, type, title, content, severity, created_at)
             VALUES (?, ?, ?, ?, NULL, 'normal', ?)`,
            ['event_old', 'xscaffold', 'note', '远古事件', oldIso],
        );
        const r = await projectGenerateDigest.handler(
            { projectId: 'xscaffold', range: 'all', format: 'json' },
            { db: driver },
        );
        const titles = r.data.digest.recentEvents.map((e) => e.title);
        expect(titles).toContain('远古事件');
    });

    test('schema 默认值生效：format=markdown，range=daily', async () => {
        // 模拟 production 路径：toolRegistry 先经 schema 解析再调 handler
        const params = projectGenerateDigest.paramsSchema.parse({ projectId: 'xscaffold' });
        expect(params.format).toBe('markdown');
        expect(params.range).toBe('daily');
        const r = await projectGenerateDigest.handler(params, { db: driver });
        expect(typeof r.data.digest).toBe('string');
    });

    test('项目不存在 → NotFoundError', async () => {
        await expect(projectGenerateDigest.handler({ projectId: 'ghost' }, { db: driver })).rejects.toThrow(
            NotFoundError,
        );
    });
});
