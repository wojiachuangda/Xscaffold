// [refactor] ID: V2-AGENT-LOOP | Date: 2026-05-20 | Description: 把 toolRegistry 的 Zod paramsSchema 转成 OpenAI function-calling tools 数组
'use strict';

const { zodToJsonSchema } = require('zod-to-json-schema');

/**
 * 单个 tool def → OpenAI function tool。
 * $refStrategy: 'none' 展开内联（OpenAI function parameters 不支持 $ref）。
 */
function toOpenAITool(toolDef) {
    const parameters = zodToJsonSchema(toolDef.paramsSchema, {
        target: 'openApi3',
        $refStrategy: 'none',
    });
    return {
        type: 'function',
        function: {
            name: toolDef.name,
            description: toolDef.description || toolDef.name,
            parameters,
        },
    };
}

/**
 * @param {Array<{name, description, paramsSchema}>} toolDefs
 * @returns {Array} OpenAI tools 数组（空数组时调用方应省略 tools 字段）
 */
function toOpenAITools(toolDefs) {
    return (toolDefs || []).map(toOpenAITool);
}

module.exports = { toOpenAITool, toOpenAITools };
