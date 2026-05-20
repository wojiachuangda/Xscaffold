// [test] ID: T4.3 | Date: 2026-05-19 | Description: executionStore 集成测试（A.1 async 契约）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');

const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildExecutionStore } = require('../../src/workflowEngine/executionStore');
const { NotFoundError, ValidationError } = require('../../src/infrastructure/errors/AppError');

async function bootStore() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    return { driver, store: buildExecutionStore(driver) };
}

describe('executionStore', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await bootStore();
    });
    afterEach(() => ctx.driver.close());

    test('create 默认 PENDING', async () => {
        const e = await ctx.store.create({ workflowId: 'wf1', input: { x: 1 } });
        expect(e.id).toMatch(/^exec_/);
        expect(e.status).toBe('PENDING');
        expect(e.input).toEqual({ x: 1 });
        expect(e.finishedAt).toBeNull();
    });

    test('markRunning + markFinal SUCCESS', async () => {
        const e = await ctx.store.create({ workflowId: 'wf1', input: null });
        await ctx.store.markRunning(e.id);
        const final = await ctx.store.markFinal(e.id, {
            status: 'SUCCESS',
            result: { sum: { result: 5 } },
            error: null,
            durationMs: 123,
        });
        expect(final.status).toBe('SUCCESS');
        expect(final.result).toEqual({ sum: { result: 5 } });
        expect(final.durationMs).toBe(123);
        expect(final.finishedAt).toBeTruthy();
    });

    test('markFinal FAILED with error', async () => {
        const e = await ctx.store.create({ workflowId: 'wf1', input: null });
        const f = await ctx.store.markFinal(e.id, {
            status: 'FAILED',
            result: null,
            error: { code: 'X', message: 'm' },
            durationMs: 50,
        });
        expect(f.status).toBe('FAILED');
        expect(f.error).toEqual({ code: 'X', message: 'm' });
    });

    test('list 返回最近执行并支持 workflowId/status 过滤', async () => {
        const first = await ctx.store.create({ workflowId: 'wf1', input: { n: 1 } });
        await ctx.store.markFinal(first.id, {
            status: 'FAILED',
            result: null,
            error: { code: 'X', message: 'm' },
        });
        const second = await ctx.store.create({ workflowId: 'wf2', input: { n: 2 } });
        await ctx.store.markFinal(second.id, { status: 'SUCCESS', result: { ok: true }, error: null });

        const all = await ctx.store.list({ limit: 10, offset: 0 });
        const filtered = await ctx.store.list({ workflowId: 'wf2', status: 'SUCCESS', limit: 10, offset: 0 });

        expect(all.total).toBe(2);
        expect(all.items.map((item) => item.id)).toEqual(expect.arrayContaining([first.id, second.id]));
        expect(filtered.total).toBe(1);
        expect(filtered.items[0].id).toBe(second.id);
    });

    test('list 支持分页', async () => {
        await ctx.store.create({ workflowId: 'wf1', input: null });
        await ctx.store.create({ workflowId: 'wf1', input: null });

        const page = await ctx.store.list({ limit: 1, offset: 1 });

        expect(page.total).toBe(2);
        expect(page.items).toHaveLength(1);
    });

    test('requireById 不存在 → NotFoundError', async () => {
        await expect(ctx.store.requireById('exec_xyz')).rejects.toThrow(NotFoundError);
    });

    test('非法 status → 应用层契约拒绝', async () => {
        const e = await ctx.store.create({ workflowId: 'wf1', input: null });
        await expect(ctx.store.markFinal(e.id, { status: 'WAT', durationMs: 0 })).rejects.toThrow(ValidationError);
    });
});
