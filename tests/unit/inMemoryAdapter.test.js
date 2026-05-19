// [test] ID: V1.5-B | Date: 2026-05-20 | Description: 内存队列适配器单元测试（V1.5-B 起 enqueue/getJob/close 为 async）
'use strict';

const { createInMemoryAdapter } = require('../../src/infrastructure/queue/inMemoryAdapter');

async function waitForJob(queue, jobId, timeout = 1000) {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        // eslint-disable-next-line no-await-in-loop
        const j = await queue.getJob(jobId);
        if (j && (j.status === 'SUCCESS' || j.status === 'FAILED')) {
            return j;
        }
        if (Date.now() - start > timeout) {
            throw new Error('job timeout');
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 5));
    }
}

describe('inMemoryAdapter', () => {
    let queue;
    beforeEach(() => {
        queue = createInMemoryAdapter();
    });
    afterEach(async () => {
        await queue.close();
    });

    test('enqueue + process worker → SUCCESS', async () => {
        queue.process('add', async ({ a, b }) => a + b);
        const { jobId } = await queue.enqueue('add', { a: 2, b: 3 });
        const job = await waitForJob(queue, jobId);
        expect(job.status).toBe('SUCCESS');
        expect(job.result).toBe(5);
    });

    test('worker 抛错 → FAILED + error 字段', async () => {
        queue.process('bad', async () => {
            throw new Error('boom');
        });
        const { jobId } = await queue.enqueue('bad', {});
        const job = await waitForJob(queue, jobId);
        expect(job.status).toBe('FAILED');
        expect(job.error.message).toBe('boom');
    });

    test('无 worker 注册 → FAILED with NO_WORKER', async () => {
        const { jobId } = await queue.enqueue('orphan', {});
        const job = await waitForJob(queue, jobId);
        expect(job.status).toBe('FAILED');
        expect(job.error.code).toBe('NO_WORKER');
    });

    test('onJobComplete 回调被触发', async () => {
        queue.process('echo', async (p) => p);
        const calls = [];
        queue.onJobComplete((j) => calls.push(j));
        await queue.enqueue('echo', { v: 1 });
        await new Promise((r) => setTimeout(r, 20));
        expect(calls.length).toBe(1);
        expect(calls[0].status).toBe('SUCCESS');
    });

    test('getJob 不存在返回 null', async () => {
        expect(await queue.getJob('nope')).toBeNull();
    });

    test('process 非函数 → 抛错', () => {
        expect(() => queue.process('x', null)).toThrow();
    });
});
