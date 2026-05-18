// [test] ID: T4.3 | Date: 2026-05-18 | Description: executionStore 集成测试
'use strict';

const Database = require('better-sqlite3');

const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildExecutionStore } = require('../../src/workflowEngine/executionStore');
const { NotFoundError } = require('../../src/infrastructure/errors/AppError');

function bootStore() {
    const db = new Database(':memory:');
    migrate({ db });
    return { db, store: buildExecutionStore(db) };
}

describe('executionStore', () => {
    let ctx;
    beforeEach(() => {
        ctx = bootStore();
    });
    afterEach(() => ctx.db.close());

    test('create 默认 PENDING', () => {
        const e = ctx.store.create({ workflowId: 'wf1', input: { x: 1 } });
        expect(e.id).toMatch(/^exec_/);
        expect(e.status).toBe('PENDING');
        expect(e.input).toEqual({ x: 1 });
        expect(e.finishedAt).toBeNull();
    });

    test('markRunning + markFinal SUCCESS', () => {
        const e = ctx.store.create({ workflowId: 'wf1', input: null });
        ctx.store.markRunning(e.id);
        const final = ctx.store.markFinal(e.id, {
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

    test('markFinal FAILED with error', () => {
        const e = ctx.store.create({ workflowId: 'wf1', input: null });
        const f = ctx.store.markFinal(e.id, {
            status: 'FAILED',
            result: null,
            error: { code: 'X', message: 'm' },
            durationMs: 50,
        });
        expect(f.status).toBe('FAILED');
        expect(f.error).toEqual({ code: 'X', message: 'm' });
    });

    test('requireById 不存在 → NotFoundError', () => {
        expect(() => ctx.store.requireById('exec_xyz')).toThrow(NotFoundError);
    });

    test('非法 status → CHECK 约束拒绝', () => {
        const e = ctx.store.create({ workflowId: 'wf1', input: null });
        expect(() => ctx.store.markFinal(e.id, { status: 'WAT', durationMs: 0 })).toThrow();
    });
});
