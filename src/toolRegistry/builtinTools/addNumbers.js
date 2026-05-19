// [scaffold] ID: T2.2 | Date: 2026-05-18 | Description: 内置工具 addNumbers——示例数学工具
'use strict';

const { z } = require('zod');

module.exports = {
    name: 'addNumbers',
    description: '两数求和',
    paramsSchema: z.object({ a: z.number(), b: z.number() }).strict(),
    // handler 体内无 I/O；async 仅为契合 Tool 接口
    // eslint-disable-next-line require-await
    handler: async ({ a, b }) => ({ result: a + b }),
};
