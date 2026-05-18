// [scaffold] ID: T0.3 | Date: 2026-05-18 | Description: Express 全局错误中间件——将异常归一化为统一响应契约
'use strict';

const { AppError } = require('../../infrastructure/errors/AppError');
const { failure } = require('../response/envelope');
const { logger } = require('../../observability/logger');

/**
 * 404 兜底：放在所有业务路由之后
 */
function notFoundHandler(req, res, next) {
    next(
        new AppError(`路径不存在: ${req.method} ${req.originalUrl}`, {
            code: 'NOT_FOUND',
            status: 404,
        }),
    );
}

/**
 * 全局错误处理（Express 4 签名：err, req, res, next）
 * 仅识别 AppError；其他异常一律 500，避免泄漏内部细节。
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
    const isAppError = err instanceof AppError;
    const status = isAppError ? err.status : 500;
    const responseBody = isAppError
        ? failure(err.toResponse())
        : failure({ code: 'INTERNAL_ERROR', message: '服务器内部错误' });

    const logCtx = {
        method: req.method,
        url: req.originalUrl,
        status,
        code: responseBody.error.code,
        stack: err.stack,
    };

    if (status >= 500) {
        logger.error(logCtx, err.message);
    } else {
        logger.warn(logCtx, err.message);
    }

    res.status(status).json(responseBody);
}

module.exports = { errorHandler, notFoundHandler };
