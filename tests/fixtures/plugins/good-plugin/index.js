// [fixture] ID: T3.4-fixture | Date: 2026-05-18 | Description: 测试用合法插件
'use strict';

const { z } = require('zod');

function register(toolRegistry) {
    toolRegistry.register({
        name: 'goodPluginTool',
        description: 'fixture',
        paramsSchema: z.object({}).passthrough(),
        handler: async () => ({ ok: true }),
    });
}

module.exports = { register };
