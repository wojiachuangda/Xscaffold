// [scaffold] ID: T0.3 | Date: 2026-05-18 | Description: 应用统一错误基类与典型子类（AA-SEAC §3 约束 1 统一响应契约）
'use strict';

/**
 * AppError - 应用域错误基类
 * 所有抛向 Express 全局错误中间件的错误必须继承此类，否则视为意料之外的系统异常。
 */
class AppError extends Error {
    /**
     * @param {string} message  用户可读的错误消息
     * @param {object} options
     * @param {string} options.code   稳定的错误码（用于客户端判断）
     * @param {number} options.status HTTP 状态码
     * @param {object} [options.details] 额外结构化信息（如校验错误列表）
     * @param {Error}  [options.cause]   原始错误（用于日志链路追踪）
     */
    constructor(message, { code, status, details, cause } = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code || 'INTERNAL_ERROR';
        this.status = status || 500;
        if (details !== undefined) {
            this.details = details;
        }
        if (cause !== undefined) {
            this.cause = cause;
        }
        Error.captureStackTrace?.(this, this.constructor);
    }

    /**
     * 序列化为统一响应契约的 error 节
     */
    toResponse() {
        const payload = { code: this.code, message: this.message };
        if (this.details !== undefined) {
            payload.details = this.details;
        }
        return payload;
    }
}

class ValidationError extends AppError {
    constructor(message = '请求参数不合法', details) {
        super(message, { code: 'VALIDATION_ERROR', status: 400, details });
    }
}

class NotFoundError extends AppError {
    constructor(message = '资源不存在', details) {
        super(message, { code: 'NOT_FOUND', status: 404, details });
    }
}

class AuthError extends AppError {
    constructor(message = '未认证或认证失败', details) {
        super(message, { code: 'UNAUTHORIZED', status: 401, details });
    }
}

class ForbiddenError extends AppError {
    constructor(message = '无权访问', details) {
        super(message, { code: 'FORBIDDEN', status: 403, details });
    }
}

class ConflictError extends AppError {
    constructor(message = '资源冲突', details) {
        super(message, { code: 'CONFLICT', status: 409, details });
    }
}

class TimeoutError extends AppError {
    constructor(message = '操作超时', details) {
        super(message, { code: 'TIMEOUT', status: 504, details });
    }
}

class RateLimitError extends AppError {
    constructor(message = '请求过于频繁', details) {
        super(message, { code: 'RATE_LIMIT', status: 429, details });
    }
}

module.exports = {
    AppError,
    ValidationError,
    NotFoundError,
    AuthError,
    ForbiddenError,
    ConflictError,
    TimeoutError,
    RateLimitError,
};
