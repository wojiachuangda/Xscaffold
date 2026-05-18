// [scaffold] ID: T1.5 | Date: 2026-05-18 | Description: 异步路由处理器包装——自动 catch 异常转发给全局错误中间件
'use strict';

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
