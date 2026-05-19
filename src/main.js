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
            gracefulCloseQueue(app)
                .then(() => process.exit(0))
                .catch((err) => {
                    logger.error({ err: err.message }, 'queue close failed during shutdown');
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
 * 第二步：await deps.queue.close() 等待在途 worker 完成。
 * BullMQ 队列尤其需要此步：未关将留下 ioredis 连接句柄。
 */
async function gracefulCloseQueue(app) {
    const deps = app.locals && app.locals.deps;
    if (deps && deps.queue && typeof deps.queue.close === 'function') {
        await deps.queue.close();
    }
}

if (require.main === module) {
    start();
}

module.exports = { start };
