// [refactor] ID: V1.5-B | Date: 2026-05-20 | Description: 应用入口——启动 Express + 优雅停机：先停 HTTP 收新请求，再 await queue.close() 等在途 job
'use strict';

require('dotenv').config();

const { createApp } = require('./apiGateway/server');
const { migrate } = require('./infrastructure/database/migrate');
const { logger } = require('./observability/logger');

const PORT = Number(process.env.PORT) || 3000;
const SHUTDOWN_HARD_TIMEOUT_MS = 10000;

/**
 * 启动前自动应用 pending 迁移——避免拉取新迁移后 schema 落后于代码导致运行期报错。
 * 默认开启；`DB_AUTO_MIGRATE=false` 可关（如生产走独立迁移流水线）。失败即 fail-fast，
 * 不带残缺 schema 起服务（迁移用同一 getDb() 单例，与后续 createApp 共用连接）。
 */
async function runStartupMigrations() {
    if (process.env.DB_AUTO_MIGRATE === 'false') {
        logger.info({}, 'startup auto-migrate 跳过 (DB_AUTO_MIGRATE=false)');
        return;
    }
    const { applied } = await migrate();
    if (applied.length > 0) {
        logger.info({ applied }, 'startup migrations applied');
    }
}

async function start() {
    await runStartupMigrations();
    const app = createApp();
    const server = app.listen(PORT, () => {
        logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'server started');
        app.locals.deps?.scheduler?.start(); // 启动 cron 调度（createApp 不启，保测试干净）
    });

    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        logger.info({ signal }, 'shutting down');
        // 第一步：停 HTTP 收新请求；现有请求继续完成
        server.close(() => {
            gracefulShutdown(app)
                .then(() => process.exit(0))
                .catch((err) => {
                    logger.error({ err: err.message }, 'graceful shutdown failed');
                    process.exit(1);
                });
        });
        // 兜底：硬超时
        setTimeout(() => process.exit(1), SHUTDOWN_HARD_TIMEOUT_MS).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * 第二步：依次释放资源（best-effort）。
 * - queue.close()：等待在途 worker 完成，关 ioredis 连接句柄
 * - ioorRecorder.close()：flush IOOR 缓冲并清定时器（受控 shutdown 的 flush 触发点）
 * - flushLogger()：worker transport 模式下 flush 主线程→worker 的 in-flight 日志
 *
 * 注意：这是受控 shutdown 的 best-effort flush。非受控崩溃（kill -9 / 掉电）
 * 不在此保障内——IOOR 见 AA-SEAC §4.2 修订；日志见 CHANGELOG v1.8.0 的
 * bounded log loss window 声明。
 */
async function gracefulShutdown(app) {
    const deps = (app.locals && app.locals.deps) || {};
    if (deps.scheduler && typeof deps.scheduler.stop === 'function') {
        deps.scheduler.stop();
    }
    if (deps.queue && typeof deps.queue.close === 'function') {
        await deps.queue.close();
    }
    if (deps.ioorRecorder && typeof deps.ioorRecorder.close === 'function') {
        await deps.ioorRecorder.close();
    }
    await flushLogger(2000);
}

/**
 * flush pino 日志（worker transport 模式下避免丢日志）。
 * 带超时兜底——坏 transport 也不能让 shutdown 永等。
 */
function flushLogger(timeoutMs) {
    return Promise.race([
        new Promise((resolve) => {
            try {
                logger.flush(() => resolve());
            } catch (_) {
                resolve();
            }
        }),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
}

if (require.main === module) {
    start().catch((err) => {
        logger.error({ err: err.message }, 'startup failed');
        process.exit(1);
    });
}

module.exports = { start };
