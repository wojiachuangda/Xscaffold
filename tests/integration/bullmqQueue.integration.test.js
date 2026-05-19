// [test] ID: V1.5-B | Date: 2026-05-20 | Description: BullMQ 适配器集成测试——需真 Redis（REDIS_TEST_URL）；无则整 suite skip
'use strict';

const { createBullmqAdapter } = require('../../src/infrastructure/queue/bullmqAdapter');

const REDIS_URL = process.env.REDIS_TEST_URL;
const describeIfRedis = REDIS_URL ? describe : describe.skip;

const TEST_QUEUE = 'test.bullmq';

async function waitUntil(predicate, timeout = 3000, interval = 30) {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        // eslint-disable-next-line no-await-in-loop
        const v = await predicate();
        if (v) {
            return v;
        }
        if (Date.now() - start > timeout) {
            throw new Error(`waitUntil 超时（${timeout}ms）`);
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, interval));
    }
}

describeIfRedis('BullMQ 队列集成测试', () => {
    let queue;

    beforeEach(async () => {
        queue = createBullmqAdapter({
            driver: 'bullmq',
            connectionUrl: REDIS_URL,
            concurrency: 2,
            maxAttempts: 1,
        });
        // 清场：删该测试队列的全部 BullMQ 键，确保用例间隔离
        // bullmq 用 bull:<queue>:* 作为键前缀
        // 用低阶 ioredis 命令清掉，避免残留 job 干扰
        // eslint-disable-next-line global-require
        const IORedis = require('ioredis');
        const cleanupClient = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
        const keys = await cleanupClient.keys(`bull:${TEST_QUEUE}:*`);
        if (keys.length > 0) {
            await cleanupClient.del(...keys);
        }
        await cleanupClient.quit();
    });

    afterEach(async () => {
        await queue.close();
    });

    test('enqueue + worker 处理 → SUCCESS，getJob 状态归一', async () => {
        queue.process(TEST_QUEUE, async ({ a, b }) => a + b);
        const { jobId } = await queue.enqueue(TEST_QUEUE, { a: 7, b: 5 });
        expect(jobId).toBeTruthy();

        const finished = await waitUntil(async () => {
            const j = await queue.getJob(jobId);
            return j && (j.status === 'SUCCESS' || j.status === 'FAILED') ? j : null;
        });
        expect(finished.status).toBe('SUCCESS');
        expect(finished.result).toBe(12);
    });

    test('worker 抛错 → getJob 状态映射为 FAILED', async () => {
        queue.process(TEST_QUEUE, async () => {
            throw new Error('boom-bullmq');
        });
        const { jobId } = await queue.enqueue(TEST_QUEUE, {});

        const finished = await waitUntil(async () => {
            const j = await queue.getJob(jobId);
            return j && j.status === 'FAILED' ? j : null;
        });
        expect(finished.error.message).toMatch(/boom-bullmq/);
    });

    test('onJobComplete 在 SUCCESS 时被调用一次', async () => {
        queue.process(TEST_QUEUE, async (p) => p);
        const calls = [];
        queue.onJobComplete((j) => calls.push(j));
        await queue.enqueue(TEST_QUEUE, { v: 1 });

        await waitUntil(() => Promise.resolve(calls.length === 1 ? true : null));
        expect(calls[0].status).toBe('SUCCESS');
    });

    test('getJob 不存在 jobId 返回 null', async () => {
        // 必须先注册 worker，否则 queue 都未创建
        queue.process(TEST_QUEUE, async () => null);
        await queue.enqueue(TEST_QUEUE, {}); // 触发 queue 实例创建
        expect(await queue.getJob('does-not-exist-99999')).toBeNull();
    });

    test('process 非函数 → 抛错', () => {
        expect(() => queue.process(TEST_QUEUE, null)).toThrow();
    });

    test('持久化：enqueue 后不消费，新 adapter 连接 Redis 仍能 getJob', async () => {
        const { jobId } = await queue.enqueue(TEST_QUEUE, { stashed: true });
        // 不注册 worker → job 留在 waiting 队列
        const j1 = await queue.getJob(jobId);
        expect(j1.status).toBe('PENDING');

        // 关 adapter（不删 Redis 数据）
        await queue.close();

        // 新 adapter 实例
        queue = createBullmqAdapter({
            driver: 'bullmq',
            connectionUrl: REDIS_URL,
            concurrency: 2,
            maxAttempts: 1,
        });
        // 为查 jobId 需要先建一次 Queue 实例（getJob 内部遍历 byName）
        queue.process(TEST_QUEUE, async () => null);
        const j2 = await queue.getJob(jobId);
        expect(j2).not.toBeNull();
        expect(j2.id).toBe(jobId);
    });
});
