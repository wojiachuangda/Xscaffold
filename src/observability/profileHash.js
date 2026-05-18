// [scaffold] ID: T5.3 | Date: 2026-05-18 | Description: Agent 画像 SHA-256 计算（AA-SEAC §4.4 角色画像版本化）
'use strict';

const crypto = require('crypto');

/**
 * 计算 agent 画像哈希。输入字段排序后拼接，保证幂等
 * @param {{ model: string, tools?: string[], systemPrompt?: string }} agent
 * @returns {string} 64 字符 hex
 */
function computeProfileHash(agent) {
    if (!agent) {
        return null;
    }
    const tools = Array.isArray(agent.tools) ? [...agent.tools].sort() : [];
    const parts = [
        `model:${agent.model || ''}`,
        `tools:${tools.join(',')}`,
        `systemPrompt:${agent.systemPrompt || ''}`,
    ];
    return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
}

module.exports = { computeProfileHash };
