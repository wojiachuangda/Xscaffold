// [scaffold] ID: T0.3 | Date: 2026-05-18 | Description: 统一 API 响应契约 { success, data, error, meta } 的构造函数
'use strict';

/**
 * 构造成功响应
 * @param {*} data
 * @param {object} [meta] 分页等附加信息
 */
function success(data = null, meta) {
    const body = { success: true, data, error: null };
    if (meta !== undefined) {
        body.meta = meta;
    }
    return body;
}

/**
 * 构造错误响应
 * @param {object} errorPayload  {code, message, details?}
 */
function failure(errorPayload) {
    return { success: false, data: null, error: errorPayload };
}

module.exports = { success, failure };
