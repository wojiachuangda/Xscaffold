// [test] ID: PAM-4 | Date: 2026-05-19 | Description: eventRepository 集成测试（不可变流水 insert + listRecent + 项目隔离）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { buildEventRepository } = require('../../src/domain/projectAssistant/repositories/eventRepository');
const { migrate } = require('../../src/infrastructure/database/migrate');

async function createRepo() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    return { driver, repo: buildEventRepository(driver) };
}

describe('eventRepository', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await createRepo();
    });
    afterEach(() => ctx.driver.close());

    test('findById 不存在返回 null', async () => {
        expect(await ctx.repo.findById('nope')).toBeNull();
    });

    test('insert 生成 event_ 前缀 id 与 createdAt', async () => {
        const e = await ctx.repo.insert({ projectId: 'p', type: 'ci_passed', title: 'CI 全绿', severity: 'high' });
        expect(e.eventId).toMatch(/^event_/);
        expect(e.createdAt).toBeTruthy();
        expect(e.severity).toBe('high');
        expect(e.content).toBeNull();
        expect(await ctx.repo.findById(e.eventId)).toEqual(e);
    });

    test('insert content 可选；severity 缺省 normal', async () => {
        const e = await ctx.repo.insert({ projectId: 'p', type: 'note', title: 't' });
        expect(e.severity).toBe('normal');
        expect(e.content).toBeNull();
    });

    test('listRecent 按 createdAt 倒序并受 limit 限制', async () => {
        for (let i = 0; i < 5; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await ctx.repo.insert({ projectId: 'p', type: 'note', title: `e${i}` });
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 3));
        }
        const recent = await ctx.repo.listRecent('p', 3);
        expect(recent).toHaveLength(3);
        expect(recent[0].title).toBe('e4');
        expect(recent[2].title).toBe('e2');
    });

    test('listRecent 项目隔离', async () => {
        await ctx.repo.insert({ projectId: 'p1', type: 'note', title: 'A' });
        await ctx.repo.insert({ projectId: 'p2', type: 'note', title: 'B' });
        const r = await ctx.repo.listRecent('p1', 10);
        expect(r).toHaveLength(1);
        expect(r[0].title).toBe('A');
    });
});
