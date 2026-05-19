// [test] ID: V1.5-B | Date: 2026-05-20 | Description: bullmqAdapter / queue dispatch 纯函数单测（无需真 Redis）
'use strict';

const { mapStatus, STATE_MAP } = require('../../src/infrastructure/queue/bullmqAdapter');
const { parseQueueConfig } = require('../../src/infrastructure/queue');

describe('mapStatus（BullMQ → 契约状态映射）', () => {
    test.each([
        ['waiting', 'PENDING'],
        ['waiting-children', 'PENDING'],
        ['delayed', 'PENDING'],
        ['paused', 'PENDING'],
        ['active', 'RUNNING'],
        ['completed', 'SUCCESS'],
        ['failed', 'FAILED'],
        ['unknown', 'FAILED'],
    ])('%s → %s', (bullState, expected) => {
        expect(mapStatus(bullState)).toBe(expected);
    });

    test('未识别状态 fallback 到 PENDING', () => {
        expect(mapStatus('mystery-state')).toBe('PENDING');
    });

    test('STATE_MAP 是冻结对象', () => {
        expect(Object.isFrozen(STATE_MAP)).toBe(true);
    });
});

describe('parseQueueConfig（dispatch）', () => {
    const ORIG_ENV = process.env;
    beforeEach(() => {
        process.env = { ...ORIG_ENV };
        delete process.env.QUEUE_DRIVER;
        delete process.env.REDIS_URL;
        delete process.env.REDIS_TEST_URL;
        delete process.env.QUEUE_CONCURRENCY;
        delete process.env.QUEUE_MAX_ATTEMPTS;
    });
    afterAll(() => {
        process.env = ORIG_ENV;
    });

    test('默认 → memory', () => {
        expect(parseQueueConfig({})).toEqual({ driver: 'memory' });
    });

    test('QUEUE_DRIVER=memory 显式', () => {
        expect(parseQueueConfig({ QUEUE_DRIVER: 'memory' })).toEqual({ driver: 'memory' });
    });

    test('QUEUE_DRIVER=bullmq + REDIS_URL → 完整配置 + 默认值', () => {
        const cfg = parseQueueConfig({
            QUEUE_DRIVER: 'bullmq',
            REDIS_URL: 'redis://localhost:6379',
        });
        expect(cfg).toEqual({
            driver: 'bullmq',
            connectionUrl: 'redis://localhost:6379',
            concurrency: 5,
            maxAttempts: 1,
        });
    });

    test('QUEUE_DRIVER=bullmq + REDIS_TEST_URL fallback', () => {
        const cfg = parseQueueConfig({
            QUEUE_DRIVER: 'bullmq',
            REDIS_TEST_URL: 'redis://test-host:6379',
        });
        expect(cfg.connectionUrl).toBe('redis://test-host:6379');
    });

    test('QUEUE_DRIVER=bullmq 缺 REDIS_URL → 抛错', () => {
        expect(() => parseQueueConfig({ QUEUE_DRIVER: 'bullmq' })).toThrow(
            /QUEUE_DRIVER=bullmq 需要同时设置 REDIS_URL/,
        );
    });

    test('QUEUE_CONCURRENCY / QUEUE_MAX_ATTEMPTS 被吸收', () => {
        const cfg = parseQueueConfig({
            QUEUE_DRIVER: 'bullmq',
            REDIS_URL: 'redis://x:6379',
            QUEUE_CONCURRENCY: '12',
            QUEUE_MAX_ATTEMPTS: '3',
        });
        expect(cfg.concurrency).toBe(12);
        expect(cfg.maxAttempts).toBe(3);
    });

    test('QUEUE_CONCURRENCY 非法值被忽略，回到默认 5', () => {
        const cfg = parseQueueConfig({
            QUEUE_DRIVER: 'bullmq',
            REDIS_URL: 'redis://x:6379',
            QUEUE_CONCURRENCY: 'abc',
        });
        expect(cfg.concurrency).toBe(5);
    });

    test('未知 QUEUE_DRIVER → 抛错', () => {
        expect(() => parseQueueConfig({ QUEUE_DRIVER: 'rabbitmq' })).toThrow(/不支持的 QUEUE_DRIVER/);
    });
});
