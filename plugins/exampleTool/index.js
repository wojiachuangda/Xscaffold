// [plugin] ID: T3.4 | Date: 2026-05-18 | Description: 示例插件——字符串反转工具，演示 toolRegistry.register 协议
'use strict';

const { z } = require('zod');

const reverseString = {
    name: 'reverseString',
    description: '将字符串按字符反转（演示插件机制）',
    paramsSchema: z.object({ input: z.string().min(1).max(1000) }).strict(),
    handler: async ({ input }) => ({ result: [...input].reverse().join('') }),
};

function register(toolRegistry) {
    toolRegistry.register(reverseString);
}

module.exports = { register, reverseString };
