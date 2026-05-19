// [test] ID: PAM-6 | Date: 2026-05-19 | Description: externalAgentProfiles 单元测试（白名单解析 + override 钩子）
'use strict';

const { EXTERNAL_AGENT_PROFILES, resolveProfile } = require('../../src/domain/projectAssistant/externalAgentProfiles');
const { ValidationError } = require('../../src/infrastructure/errors/AppError');

describe('externalAgentProfiles (PAM-6)', () => {
    afterEach(() => {
        delete process.env.EXTERNAL_AGENT_PROFILE_OVERRIDE;
    });

    test('claudeHttp 内置 profile 固定为 127.0.0.1', () => {
        expect(EXTERNAL_AGENT_PROFILES.claudeHttp.baseUrl).toBe('http://127.0.0.1:4567');
    });

    test('resolveProfile 命中已知 profile', () => {
        expect(resolveProfile('claudeHttp').endpoint).toBe('/messages');
    });

    test('resolveProfile 未知 profile → ValidationError', () => {
        expect(() => resolveProfile('unknown')).toThrow(ValidationError);
    });

    test('EXTERNAL_AGENT_PROFILE_OVERRIDE 生效（测试 stub）', () => {
        process.env.EXTERNAL_AGENT_PROFILE_OVERRIDE = JSON.stringify({
            claudeHttp: { baseUrl: 'http://127.0.0.1:9999', endpoint: '/stub', method: 'POST', timeoutMs: 5000 },
        });
        expect(resolveProfile('claudeHttp').baseUrl).toBe('http://127.0.0.1:9999');
    });

    test('override 非法 JSON → ValidationError', () => {
        process.env.EXTERNAL_AGENT_PROFILE_OVERRIDE = '{not-json';
        expect(() => resolveProfile('claudeHttp')).toThrow(ValidationError);
    });
});
