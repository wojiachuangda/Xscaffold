// [scaffold] ID: T2.2 | Date: 2026-05-18 | Description: 内置工具 httpRequest——基于 Node fetch 的 HTTP 客户端
'use strict';

const { z } = require('zod');

const paramsSchema = z
    .object({
        url: z.string().url(),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
        headers: z.record(z.string()).optional(),
        body: z.union([z.string(), z.record(z.any()), z.null()]).optional(),
    })
    .strict();

async function handler(params) {
    const init = { method: params.method, headers: params.headers || {} };
    if (params.body !== undefined && params.body !== null && params.method !== 'GET') {
        if (typeof params.body === 'string') {
            init.body = params.body;
        } else {
            init.body = JSON.stringify(params.body);
            init.headers['content-type'] = init.headers['content-type'] || 'application/json';
        }
    }
    const res = await fetch(params.url, init);
    const text = await res.text();
    return {
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
        body: text,
    };
}

module.exports = {
    name: 'httpRequest',
    description: '发起 HTTP 请求',
    paramsSchema,
    handler,
};
