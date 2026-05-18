// [test] ID: T4.5 | Date: 2026-05-18 | Description: 内存队列适配器单元测试
'use strict';

const { createInMemoryAdapter } = require('../../src/infrastructure/queue/inMemoryAdapter');

function waitForJob(queue, jobId, timeout = 1000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const tick = setInterval(() => {
            const j = queue.getJob(jobId);
            if (j && (j.status === 'SUCCESS' || j.status === 'FAILED')) {
                clearInterval(tick);
                resolve(j);
            } else if (Date.now() - start > timeout) {
                clearInterval(tick);
                reject(new Error('job timeout'));
            }
        }, 5);
    });
}

describe('inMemoryAdapter', () => {
    let queue;
    beforeEach(() => {
        queue = createInMemoryAdapter();
    });
    afterEach(() => queue.close());

    test('enqueue + process worker → SUCCESS', async () => {
        queue.process('add', async ({ a, b }) => a + b);
        const { jobId } = queue.enqueue('add', { a: 2, b: 3 });
        const job = await waitForJob(queue, jobId);
        expect(job.status).toBe('SUCCESS');
        expect(job.result).toBe(5);
    });

    test('worker 抛错 → FAILED + error 字段', async () => {
        queue.process('bad', async () => {
            throw new Error('boom');
        });
        const { jobId } = queue.enqueue('bad', {});
        const job = await waitForJob(queue, jobId);
        expect(job.status).toBe('FAILED');
        expect(job.error.message).toBe('boom');
    });

    test('无 worker 注册 → FAILED with NO_WORKER', async () => {
        const { jobId } = queue.enqueue('orphan', {});
        const job = await waitForJob(queue, jobId);
        expect(job.status).toBe('FAILED');
        expect(job.error.code).toBe('NO_WORKER');
    });

    test('onJobComplete 回调被触发', async () => {
        queue.process('echo', async (p) => p);
        const calls = [];
        queue.onJobComplete((j) => calls.push(j));
        queue.enqueue('echo', { v: 1 });
        await new Promise((r) => setTimeout(r, 20));
        expect(calls.length).toBe(1);
        expect(calls[0].status).toBe('SUCCESS');
    });

    test('getJob 不存在返回 null', () => {
        expect(queue.getJob('nope')).toBeNull();
    });

    test('process 非函数 → 抛错', () => {
        expect(() => queue.process('x', null)).toThrow();
    });
});
