// [test] ID: T5.4 | Date: 2026-05-18 | Description: traceCollector 集成测试
'use strict';

const Database = require('better-sqlite3');
const { migrate } = require('../../src/infrastructure/database/migrate');
const { buildTraceRepository } = require('../../src/observability/traceRepository');
const { createTraceCollector } = require('../../src/observability/traceCollector');

function bootCollector() {
    const db = new Database(':memory:');
    migrate({ db });
    const traceRepository = buildTraceRepository(db);
    return { db, collector: createTraceCollector({ traceRepository }), traceRepository };
}

describe('traceCollector', () => {
    let ctx;
    beforeEach(() => {
        ctx = bootCollector();
    });
    afterEach(() => ctx.db.close());

    test('startSpan + endSpan SUCCESS', async () => {
        const span = ctx.collector.startSpan({
            executionId: 'exec_1',
            nodeId: 'n1',
            nodeType: 'tool',
            attempt: 1,
        });
        expect(span.traceId).toMatch(/^trace_/);
        await new Promise((r) => setTimeout(r, 10));
        const fin = ctx.collector.endSpan(span, { status: 'SUCCESS', output: { x: 1 } });
        expect(fin.status).toBe('SUCCESS');
        expect(fin.output).toEqual({ x: 1 });
        expect(fin.durationMs).toBeGreaterThanOrEqual(10);
    });

    test('endSpan FAILED 携带 error', () => {
        const span = ctx.collector.startSpan({ executionId: 'e', nodeId: 'n', nodeType: 'agent' });
        const fin = ctx.collector.endSpan(span, {
            status: 'FAILED',
            error: { code: 'X', message: 'boom' },
        });
        expect(fin.status).toBe('FAILED');
        expect(fin.error.message).toBe('boom');
    });

    test('listByExecution 按时间排序', async () => {
        const s1 = ctx.collector.startSpan({ executionId: 'e', nodeId: 'n1', nodeType: 'tool' });
        await new Promise((r) => setTimeout(r, 5));
        const s2 = ctx.collector.startSpan({ executionId: 'e', nodeId: 'n2', nodeType: 'tool' });
        ctx.collector.endSpan(s1, { status: 'SUCCESS' });
        ctx.collector.endSpan(s2, { status: 'SUCCESS' });
        const list = ctx.collector.listByExecution('e');
        expect(list.map((t) => t.nodeId)).toEqual(['n1', 'n2']);
    });

    test('startSpan 无 executionId 返回 null（noop）', () => {
        expect(ctx.collector.startSpan({ executionId: null, nodeId: 'n', nodeType: 'tool' })).toBeNull();
    });

    test('endSpan 无 span 返回 null', () => {
        expect(ctx.collector.endSpan(null, { status: 'SUCCESS' })).toBeNull();
    });
});
