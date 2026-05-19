// [refactor] ID: V1.5-B | Date: 2026-05-20 | Description: 应用入口——启动 Express + 优雅停机：先停 HTTP 收新请求，再 await queue.close() 等在途 job
'use strict';

require('dotenv').config();

const { createApp } = require('./apiGateway/server');
const { logger } = require('./observability/logger');

const PORT = Number(process.env.PORT) || 3000;
const SHUTDOWN_HARD_TIMEOUT_MS = 10000;

function start() {
    const app = createApp();
    const server = app.listen(PORT, () => {
        logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'server started');
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
 *
 * 注意：这是受控 shutdown 的 best-effort flush。非受控崩溃（kill -9 / 掉电）
 * 不在此保障内，详见 AA-SEAC §4.2 修订说明的 bounded loss window。
 */
async function gracefulShutdown(app) {
    const deps = (app.locals && app.locals.deps) || {};
    if (deps.queue && typeof deps.queue.close === 'function') {
        await deps.queue.close();
    }
    if (deps.ioorRecorder && typeof deps.ioorRecorder.close === 'function') {
        await deps.ioorRecorder.close();
    }
}

if (require.main === module) {
    start();
}

module.exports = { start };
