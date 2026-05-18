// [test] ID: T1.3 | Date: 2026-05-18 | Description: agentRepository 集成测试（覆盖 CRUD + 边界）
'use strict';

const Database = require('better-sqlite3');
const { buildRepository } = require('../../src/agentManager/agentRepository');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { ConflictError, NotFoundError } = require('../../src/infrastructure/errors/AppError');

function createRepo() {
    const db = new Database(':memory:');
    migrate({ db });
    return { db, repo: buildRepository(db) };
}

describe('agentRepository', () => {
    let ctx;
    beforeEach(() => {
        ctx = createRepo();
    });
    afterEach(() => ctx.db.close());

    test('create + findById', () => {
        const a = ctx.repo.create({ name: 'planner', model: 'gpt-4', tools: ['t1'] });
        expect(a.id).toMatch(/^agent_/);
        expect(a.name).toBe('planner');
        expect(a.tools).toEqual(['t1']);
        expect(a.status).toBe('enabled');
        expect(ctx.repo.findById(a.id)).toEqual(a);
    });

    test('create 名称唯一约束 → ConflictError', () => {
        ctx.repo.create({ name: 'dup', model: 'm' });
        expect(() => ctx.repo.create({ name: 'dup', model: 'm' })).toThrow(ConflictError);
    });

    test('findById 不存在返回 null', () => {
        expect(ctx.repo.findById('not-exist')).toBeNull();
    });

    test('findByName', () => {
        ctx.repo.create({ name: 'unique-name', model: 'm' });
        expect(ctx.repo.findByName('unique-name').name).toBe('unique-name');
        expect(ctx.repo.findByName('nope')).toBeNull();
    });

    test('findAll 分页与状态过滤', () => {
        for (let i = 0; i < 5; i += 1) {
            ctx.repo.create({ name: `a${i}`, model: 'm', status: i % 2 === 0 ? 'enabled' : 'disabled' });
        }
        const all = ctx.repo.findAll({ limit: 10 });
        expect(all.total).toBe(5);
        expect(all.items).toHaveLength(5);

        const enabled = ctx.repo.findAll({ status: 'enabled' });
        expect(enabled.total).toBe(3);

        const page = ctx.repo.findAll({ limit: 2, offset: 0 });
        expect(page.items).toHaveLength(2);
    });

    test('findAll 名称模糊匹配', () => {
        ctx.repo.create({ name: 'researcher-en', model: 'm' });
        ctx.repo.create({ name: 'planner-en', model: 'm' });
        ctx.repo.create({ name: 'other', model: 'm' });
        const r = ctx.repo.findAll({ name: 'en' });
        expect(r.total).toBe(2);
    });

    test('update 部分字段', async () => {
        const a = ctx.repo.create({ name: 'orig', model: 'm' });
        // 等待 1ms 以保证 updated_at 不同
        await new Promise((r) => setTimeout(r, 5));
        const b = ctx.repo.update(a.id, { status: 'disabled', description: 'desc' });
        expect(b.status).toBe('disabled');
        expect(b.description).toBe('desc');
        expect(b.name).toBe('orig');
        expect(b.updatedAt).not.toBe(a.updatedAt);
    });

    test('update 不存在 → NotFoundError', () => {
        expect(() => ctx.repo.update('nope', { status: 'disabled' })).toThrow(NotFoundError);
    });

    test('update 改名冲突 → ConflictError', () => {
        ctx.repo.create({ name: 'taken', model: 'm' });
        const b = ctx.repo.create({ name: 'free', model: 'm' });
        expect(() => ctx.repo.update(b.id, { name: 'taken' })).toThrow(ConflictError);
    });

    test('remove 成功', () => {
        const a = ctx.repo.create({ name: 'gone', model: 'm' });
        expect(ctx.repo.remove(a.id)).toBe(true);
        expect(ctx.repo.findById(a.id)).toBeNull();
    });

    test('remove 不存在 → NotFoundError', () => {
        expect(() => ctx.repo.remove('nope')).toThrow(NotFoundError);
    });
});
