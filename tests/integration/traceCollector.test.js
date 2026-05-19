// [test] ID: T5.4 | Date: 2026-05-19 | Description: traceCollector 集成测试（A.1 async 契约）
'use strict';

const { createSqliteDriver } = require('../../src/infrastructure/database/drivers/sqliteDriver');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildTraceRepository } = require('../../src/observability/traceRepository');
const { createTraceCollector } = require('../../src/observability/traceCollector');

async function bootCollector() {
    const driver = createSqliteDriver({ filename: ':memory:' });
    await migrate({ driver });
    const traceRepository = buildTraceRepository(driver);
    return { driver, collector: createTraceCollector({ traceRepository }), traceRepository };
}

describe('traceCollector', () => {
    let ctx;
    beforeEach(async () => {
        ctx = await bootCollector();
    });
    afterEach(() => ctx.driver.close());

    test('startSpan + endSpan SUCCESS', async () => {
        const span = await ctx.collector.startSpan({
            executionId: 'exec_1',
            nodeId: 'n1',
            nodeType: 'tool',
            attempt: 1,
        });
        expect(span.traceId).toMatch(/^trace_/);
        await new Promise((r) => setTimeout(r, 10));
        const fin = await ctx.collector.endSpan(span, { status: 'SUCCESS', output: { x: 1 } });
        expect(fin.status).toBe('SUCCESS');
        expect(fin.output).toEqual({ x: 1 });
        expect(fin.durationMs).toBeGreaterThanOrEqual(10);
    });

    test('endSpan FAILED 携带 error', async () => {
        const span = await ctx.collector.startSpan({ executionId: 'e', nodeId: 'n', nodeType: 'agent' });
        const fin = await ctx.collector.endSpan(span, {
            status: 'FAILED',
            error: { code: 'X', message: 'boom' },
        });
        expect(fin.status).toBe('FAILED');
        expect(fin.error.message).toBe('boom');
    });

    test('listByExecution 按时间排序', async () => {
        const s1 = await ctx.collector.startSpan({ executionId: 'e', nodeId: 'n1', nodeType: 'tool' });
        await new Promise((r) => setTimeout(r, 5));
        const s2 = await ctx.collector.startSpan({ executionId: 'e', nodeId: 'n2', nodeType: 'tool' });
        await ctx.collector.endSpan(s1, { status: 'SUCCESS' });
        await ctx.collector.endSpan(s2, { status: 'SUCCESS' });
        const list = await ctx.collector.listByExecution('e');
        expect(list.map((t) => t.nodeId)).toEqual(['n1', 'n2']);
    });

    test('startSpan 无 executionId 返回 null（noop）', async () => {
        expect(await ctx.collector.startSpan({ executionId: null, nodeId: 'n', nodeType: 'tool' })).toBeNull();
    });

    test('endSpan 无 span 返回 null', async () => {
        expect(await ctx.collector.endSpan(null, { status: 'SUCCESS' })).toBeNull();
    });
});
