// [test] ID: T1.3 | Date: 2026-05-19 | Description: agentRepository 集成测试（A.1 async 契约；覆盖 CRUD + 边界）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { buildRepository } = require('../../src/agentManager/agentRepository');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { ConflictError, NotFoundError, ValidationError } = require('../../src/infrastructure/errors/AppError');

async function createRepo() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    return { driver, repo: buildRepository(driver) };
}

describe('agentRepository', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await createRepo();
    });
    afterEach(() => ctx.driver.close());

    test('create + findById', async () => {
        const a = await ctx.repo.create({ name: 'planner', model: 'gpt-4', tools: ['t1'] });
        expect(a.id).toMatch(/^agent_/);
        expect(a.name).toBe('planner');
        expect(a.tools).toEqual(['t1']);
        expect(a.status).toBe('enabled');
        expect(await ctx.repo.findById(a.id)).toEqual(a);
    });

    test('create 名称唯一约束 → ConflictError', async () => {
        await ctx.repo.create({ name: 'dup', model: 'm' });
        await expect(ctx.repo.create({ name: 'dup', model: 'm' })).rejects.toThrow(ConflictError);
    });

    test('findById 不存在返回 null', async () => {
        expect(await ctx.repo.findById('not-exist')).toBeNull();
    });

    test('findByName', async () => {
        await ctx.repo.create({ name: 'unique-name', model: 'm' });
        expect((await ctx.repo.findByName('unique-name')).name).toBe('unique-name');
        expect(await ctx.repo.findByName('nope')).toBeNull();
    });

    test('findAll 分页与状态过滤', async () => {
        for (let i = 0; i < 5; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await ctx.repo.create({ name: `a${i}`, model: 'm', status: i % 2 === 0 ? 'enabled' : 'disabled' });
        }
        const all = await ctx.repo.findAll({ limit: 10 });
        expect(all.total).toBe(5);
        expect(all.items).toHaveLength(5);

        const enabled = await ctx.repo.findAll({ status: 'enabled' });
        expect(enabled.total).toBe(3);

        const page = await ctx.repo.findAll({ limit: 2, offset: 0 });
        expect(page.items).toHaveLength(2);
    });

    test('findAll 名称模糊匹配', async () => {
        await ctx.repo.create({ name: 'researcher-en', model: 'm' });
        await ctx.repo.create({ name: 'planner-en', model: 'm' });
        await ctx.repo.create({ name: 'other', model: 'm' });
        const r = await ctx.repo.findAll({ name: 'en' });
        expect(r.total).toBe(2);
    });

    test('update 部分字段', async () => {
        const a = await ctx.repo.create({ name: 'orig', model: 'm' });
        // 等待 1ms 以保证 updated_at 不同
        await new Promise((r) => setTimeout(r, 5));
        const b = await ctx.repo.update(a.id, { status: 'disabled', description: 'desc' });
        expect(b.status).toBe('disabled');
        expect(b.description).toBe('desc');
        expect(b.name).toBe('orig');
        expect(b.updatedAt).not.toBe(a.updatedAt);
    });

    test('update 不存在 → NotFoundError', async () => {
        await expect(ctx.repo.update('nope', { status: 'disabled' })).rejects.toThrow(NotFoundError);
    });

    test('非法 status → 应用层契约拒绝', async () => {
        const a = await ctx.repo.create({ name: 'status-check', model: 'm' });
        await expect(ctx.repo.update(a.id, { status: 'INVALID' })).rejects.toThrow(ValidationError);
        await expect(ctx.repo.create({ name: 'bad-status', model: 'm', status: 'INVALID' })).rejects.toThrow(
            ValidationError,
        );
    });

    test('update 改名冲突 → ConflictError', async () => {
        await ctx.repo.create({ name: 'taken', model: 'm' });
        const b = await ctx.repo.create({ name: 'free', model: 'm' });
        await expect(ctx.repo.update(b.id, { name: 'taken' })).rejects.toThrow(ConflictError);
    });

    test('remove 成功', async () => {
        const a = await ctx.repo.create({ name: 'gone', model: 'm' });
        expect(await ctx.repo.remove(a.id)).toBe(true);
        expect(await ctx.repo.findById(a.id)).toBeNull();
    });

    test('remove 不存在 → NotFoundError', async () => {
        await expect(ctx.repo.remove('nope')).rejects.toThrow(NotFoundError);
    });
});
