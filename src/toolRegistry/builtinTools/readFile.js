// [scaffold] ID: T2.2 | Date: 2026-05-18 | Description: 内置工具 readFile——读取本地文件
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { z } = require('zod');

const paramsSchema = z
    .object({
        path: z.string().min(1),
        encoding: z.enum(['utf8', 'ascii', 'base64', 'hex']).default('utf8'),
    })
    .strict();

async function handler(params) {
    const abs = path.resolve(params.path);
    const content = await fs.readFile(abs, params.encoding);
    return { path: abs, encoding: params.encoding, content };
}

module.exports = {
    name: 'readFile',
    description: '读取本地文件内容',
    paramsSchema,
    handler,
};
