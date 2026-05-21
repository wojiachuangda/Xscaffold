// [scaffold] ID: V2.4-SCHED | Date: 2026-05-21 | Description: 工作流调度器——按 workflow.trigger.cron 注册定时任务，到点 enqueue 执行（croner，queue-agnostic）；start/stop/reload/listJobs
'use strict';

const { Cron } = require('croner');

/**
 * @param {{ workflowRegistry, enqueue: (workflowId:string)=>Promise<any>, logger? }} deps
 *   enqueue：到点触发执行的回调（闭包 deps，内部走 create execution + enqueue）
 */
function createScheduler({ workflowRegistry, enqueue, logger }) {
    let jobs = [];

    function start() {
        stop();
        for (const wf of workflowRegistry.list()) {
            const cron = wf.trigger && wf.trigger.cron;
            if (cron) {
                registerJob(wf.id, cron);
            }
        }
        logger?.info?.({ count: jobs.length }, 'scheduler started');
    }

    function registerJob(workflowId, cron) {
        try {
            const job = new Cron(cron, () => fire(workflowId));
            jobs.push({ workflowId, cron, job });
        } catch (err) {
            logger?.warn?.({ workflowId, cron, err: err.message }, 'scheduler: 非法 cron，跳过');
        }
    }

    async function fire(workflowId) {
        try {
            await enqueue(workflowId);
        } catch (err) {
            logger?.error?.({ workflowId, err: err.message }, 'scheduler: 触发执行失败');
        }
    }

    function reload() {
        start(); // stop + 重读 registry + 重新注册
    }

    function stop() {
        for (const entry of jobs) {
            try {
                entry.job.stop();
            } catch (_err) {
                /* 已停，忽略 */
            }
        }
        jobs = [];
    }

    function listJobs() {
        return jobs.map((entry) => ({
            workflowId: entry.workflowId,
            cron: entry.cron,
            nextRun: entry.job.nextRun()?.toISOString() ?? null,
        }));
    }

    return { start, stop, reload, listJobs };
}

module.exports = { createScheduler };
