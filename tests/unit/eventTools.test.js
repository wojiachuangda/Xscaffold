// [test] ID: PAM-4 | Date: 2026-05-19 | Description: eventRecord 工具单元测试（落库 + 脱敏通道 + 入参校验）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildEventRepository } = require('../../src/domain/projectAssistant/repositories/eventRepository');
const eventRecord = require('../../src/toolRegistry/builtinTools/projectAssistant/eventRecord');

describe('eventRecord tool (PAM-4)', () => {
    let driver;
    beforeEach(async () => {
        driver = createSqliteDriver({ filename: ':memory:' });
        await migrate({ driver });
    });
    afterEach(() => driver.close());

    test('记录事件并返回 eventId / createdAt', async () => {
        const r = await eventRecord.handler(
            { projectId: 'p', type: 'ci_passed', title: 'CI 全绿', content: '全部通过', severity: 'high' },
            { db: driver },
        );
        expect(r.ok).toBe(true);
        expect(r.data.eventId).toMatch(/^event_/);
        expect(r.data.createdAt).toBeTruthy();
    });

    test('severity 缺省为 normal 并正确落库', async () => {
        const r = await eventRecord.handler({ projectId: 'p', type: 'note', title: 't' }, { db: driver });
        const repo = buildEventRepository(driver);
        const saved = await repo.findById(r.data.eventId);
        expect(saved.severity).toBe('normal');
        expect(saved.content).toBeNull();
    });

    test('正常文本经脱敏通道后内容保持不变', async () => {
        const r = await eventRecord.handler(
            { projectId: 'p', type: 'note', title: '正常标题', content: '正常内容无敏感词' },
            { db: driver },
        );
        const repo = buildEventRepository(driver);
        const saved = await repo.findById(r.data.eventId);
        expect(saved.title).toBe('正常标题');
        expect(saved.content).toBe('正常内容无敏感词');
    });

    test('paramsSchema 拒绝非法 type（大写）', () => {
        const r = eventRecord.paramsSchema.safeParse({ projectId: 'p', type: 'CI_Passed', title: 't' });
        expect(r.success).toBe(false);
    });

    test('paramsSchema 拒绝非法 severity', () => {
        const r = eventRecord.paramsSchema.safeParse({ projectId: 'p', type: 'note', title: 't', severity: 'meh' });
        expect(r.success).toBe(false);
    });
});
