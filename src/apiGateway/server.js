// [scaffold] ID: T1.6 | Date: 2026-05-18 | Description: Express 应用工厂——装配中间件、路由、错误处理与健康检查
'use strict';

const express = require('express');

const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { success } = require('./response/envelope');
const { buildRouter: buildAgentRouter } = require('../agentManager/agentController');
const { buildService } = require('../agentManager/agentService');
const { buildRepository } = require('../agentManager/agentRepository');

/**
 * 创建 Express 应用
 * @param {object} [overrides] 用于测试注入（如自定义 db / repository）
 */
function createApp(overrides = {}) {
    const app = express();

    app.disable('x-powered-by');
    app.use(express.json({ limit: '1mb' }));

    // 健康检查
    app.get('/healthz', (req, res) => res.json(success({ status: 'ok', uptime: process.uptime() })));

    // Agent 路由
    const repository = overrides.agentRepository || buildRepository(overrides.db);
    const service = buildService(repository);
    app.use('/agents', buildAgentRouter(service));

    // 404 + 全局错误处理（必须在所有路由之后）
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
