// [scaffold] ID: T0.1 | Date: 2026-05-18 | Description: 应用入口（启动 Express 服务，装配中间件与路由）
'use strict';

require('dotenv').config();

const { createApp } = require('./apiGateway/server');
const { logger } = require('./observability/logger');

const PORT = Number(process.env.PORT) || 3000;

function start() {
    const app = createApp();
    const server = app.listen(PORT, () => {
        logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'server started');
    });

    const shutdown = (signal) => {
        logger.info({ signal }, 'shutting down');
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
    start();
}

module.exports = { start };
