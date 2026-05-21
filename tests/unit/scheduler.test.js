// [test] ID: V2.4-SCHED | Date: 2026-05-21 | Description: 工作流调度器单测——注册/listJobs/非法cron跳过/stop/reload + 每秒 cron 实测触发 enqueue
'use strict';

const { createScheduler } = require('../../src/workflowEngine/scheduler');

function fakeRegistry(workflows) {
    return { list: () => workflows };
}

describe('workflow scheduler', () => {
    let scheduler = null;

    afterEach(() => {
        if (scheduler) {
            scheduler.stop(); // 清 croner 定时器，避免 open handle
            scheduler = null;
        }
    });

    test('只为带 trigger.cron 的 workflow 注册', () => {
        scheduler = createScheduler({
            workflowRegistry: fakeRegistry([
                { id: 'a', trigger: { cron: '*/5 * * * *' } },
                { id: 'b', trigger: null },
                { id: 'c' },
            ]),
            enqueue: jest.fn(),
        });
        scheduler.start();
        const jobs = scheduler.listJobs();
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({ workflowId: 'a', cron: '*/5 * * * *' });
        expect(jobs[0].nextRun).toBeTruthy();
    });

    test('非法 cron 跳过、不抛', () => {
        const warn = jest.fn();
        scheduler = createScheduler({
            workflowRegistry: fakeRegistry([{ id: 'bad', trigger: { cron: 'not a cron' } }]),
            enqueue: jest.fn(),
            logger: { warn },
        });
        expect(() => scheduler.start()).not.toThrow();
        expect(scheduler.listJobs()).toHaveLength(0);
        expect(warn).toHaveBeenCalled();
    });

    test('stop 清空、reload 重注册', () => {
        scheduler = createScheduler({
            workflowRegistry: fakeRegistry([{ id: 'a', trigger: { cron: '*/5 * * * *' } }]),
            enqueue: jest.fn(),
        });
        scheduler.start();
        expect(scheduler.listJobs()).toHaveLength(1);
        scheduler.stop();
        expect(scheduler.listJobs()).toHaveLength(0);
        scheduler.reload();
        expect(scheduler.listJobs()).toHaveLength(1);
    });

    test('到点触发 enqueue（每秒 cron）', async () => {
        const enqueue = jest.fn().mockResolvedValue({});
        scheduler = createScheduler({
            workflowRegistry: fakeRegistry([{ id: 'tick', trigger: { cron: '* * * * * *' } }]),
            enqueue,
        });
        scheduler.start();
        await new Promise((resolve) => setTimeout(resolve, 1300));
        expect(enqueue).toHaveBeenCalledWith('tick');
    });
});
