// [planner] ID: PAM-6 | Date: 2026-05-19 | Description: 外部常驻 Agent profile 白名单（URL 固定在服务端，Agent/用户不可传入）
'use strict';

const { ValidationError } = require('../../infrastructure/errors/AppError');

/**
 * profile 白名单。baseUrl 硬编码于此，externalAgentSend 永不接受外部传入的 URL。
 */
const EXTERNAL_AGENT_PROFILES = {
    claudeHttp: {
        baseUrl: 'http://127.0.0.1:4567',
        endpoint: '/messages',
        method: 'POST',
        timeoutMs: 120000,
    },
};

/**
 * 读取测试钩子 EXTERNAL_AGENT_PROFILE_OVERRIDE（JSON）——
 * 用于 smoke / 单测把外部 HTTP Agent 切到 stub（PLAN Q11）。
 */
function readOverride() {
    const raw = process.env.EXTERNAL_AGENT_PROFILE_OVERRIDE;
    if (!raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch {
        throw new ValidationError('EXTERNAL_AGENT_PROFILE_OVERRIDE 不是合法 JSON');
    }
}

/**
 * 按名解析 profile；命中 override 表优先。未知 profile 直接拒绝。
 */
function resolveProfile(profileName) {
    const table = readOverride() || EXTERNAL_AGENT_PROFILES;
    const profile = table[profileName];
    if (!profile) {
        throw new ValidationError(`未知的 external agent profile: ${profileName}`);
    }
    return profile;
}

module.exports = { EXTERNAL_AGENT_PROFILES, resolveProfile };
