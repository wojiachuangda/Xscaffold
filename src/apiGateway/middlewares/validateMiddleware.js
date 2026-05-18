// [scaffold] ID: T1.5 | Date: 2026-05-18 | Description: 通用 Zod 入参校验中间件（AA-SEAC §3 约束 2）
'use strict';

const { ValidationError } = require('../../infrastructure/errors/AppError');
const { formatZodIssues } = require('../../agentManager/agentService');

/**
 * @param {{ body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }} schemas
 * 校验后将 parsed 结果挂回 req.body / req.query / req.params
 */
function validate(schemas) {
    return (req, _res, next) => {
        const errors = [];
        for (const key of ['body', 'query', 'params']) {
            if (!schemas[key]) {
                continue;
            }
            const r = schemas[key].safeParse(req[key]);
            if (!r.success) {
                errors.push(...formatZodIssues(r.error).map((e) => ({ ...e, location: key })));
            } else {
                req[key] = r.data;
            }
        }
        if (errors.length > 0) {
            return next(new ValidationError('请求参数不合法', errors));
        }
        return next();
    };
}

module.exports = { validate };
