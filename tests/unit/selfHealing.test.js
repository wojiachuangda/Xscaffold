// [test] ID: T5.6 | Date: 2026-05-18 | Description: 有界自愈控制器单元测试
'use strict';

const { z } = require('zod');
const { evaluateLLMOutput, runWithSelfHealing, MAX_HEAL_ATTEMPTS } = require('../../src/workflowEngine/selfHealing');

describe('evaluateLLMOutput', () => {
    test('空对象 → fail', () => {
        expect(evaluateLLMOutput(null).ok).toBe(false);
    });

    test('content 为空 → fail', () => {
        expect(evaluateLLMOutput({ content: '   ' }).ok).toBe(false);
    });

    test('content 非空 → ok', () => {
        expect(evaluateLLMOutput({ content: 'hello' }).ok).toBe(true);
    });

    test('JSON schema 解析成功', () => {
        const schema = z.object({ score: z.number() });
        const r = evaluateLLMOutput({ content: '{"score":0.9}' }, { expectedJsonSchema: schema });
        expect(r.ok).toBe(true);
        expect(r.parsed).toEqual({ score: 0.9 });
    });

    test('JSON 解析失败', () => {
        const schema = z.object({ score: z.number() });
        const r = evaluateLLMOutput({ content: 'not json' }, { expectedJsonSchema: schema });
        expect(r.ok).toBe(false);
        expect(r.reason).toContain('JSON 解析失败');
    });

    test('Schema 不匹配', () => {
        const schema = z.object({ score: z.number() });
        const r = evaluateLLMOutput({ content: '{"score":"high"}' }, { expectedJsonSchema: schema });
        expect(r.ok).toBe(false);
        expect(r.reason).toContain('Schema 校验失败');
    });
});

describe('runWithSelfHealing', () => {
    test('首次成功，无重试', async () => {
        const callLLM = jest.fn().mockResolvedValue({ content: 'ok' });
        const r = await runWithSelfHealing({ callLLM });
        expect(r.ok).toBe(true);
        expect(r.attempts).toBe(1);
        expect(callLLM).toHaveBeenCalledTimes(1);
    });

    test('首次空 + 第二次成功 → attempts=2，重试时携带修正指令', async () => {
        const callLLM = jest.fn().mockResolvedValueOnce({ content: '' }).mockResolvedValueOnce({ content: 'fixed' });
        const r = await runWithSelfHealing({ callLLM });
        expect(r.ok).toBe(true);
        expect(r.attempts).toBe(2);
        expect(callLLM.mock.calls[1][0]).toContain('严格按照预期格式');
    });

    test('连续失败 → attempts=3 (1 首次 + 2 重试)，ok=false', async () => {
        const callLLM = jest.fn().mockResolvedValue({ content: '' });
        const r = await runWithSelfHealing({ callLLM });
        expect(r.ok).toBe(false);
        expect(r.attempts).toBe(MAX_HEAL_ATTEMPTS + 1);
        expect(r.reason).toBeTruthy();
        expect(callLLM).toHaveBeenCalledTimes(MAX_HEAL_ATTEMPTS + 1);
    });

    test('支持 JSON schema 自愈', async () => {
        const schema = z.object({ x: z.number() });
        const callLLM = jest
            .fn()
            .mockResolvedValueOnce({ content: 'plain text' })
            .mockResolvedValueOnce({ content: '{"x":1}' });
        const r = await runWithSelfHealing({ callLLM, expectedJsonSchema: schema });
        expect(r.ok).toBe(true);
        expect(r.attempts).toBe(2);
    });
});
