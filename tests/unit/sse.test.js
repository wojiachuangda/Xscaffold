// [test] ID: V2.2-SSE | Date: 2026-05-21 | Description: SSE writer 单测——redactEvent 子载荷脱敏 + envelope 不误伤 + formatFrame 契约校验
'use strict';

const { redactEvent, formatFrame } = require('../../src/apiGateway/sse');

function parseFrame(frame) {
    const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
    return JSON.parse(dataLine.slice(dataLine.indexOf(':') + 1).trim());
}

describe('sse.redactEvent', () => {
    test('turn 事件脱敏 toolCalls.arguments 与 observations.data 里的敏感键', () => {
        const event = {
            type: 'turn',
            turnIndex: 0,
            content: '',
            toolCalls: [{ id: 'c1', name: 't', arguments: { projectId: 'p', apiKey: 'sk-secret' } }],
            observations: [{ name: 't', ok: true, data: { result: 'x', password: 'pw-secret' } }],
            ts: 't',
        };
        const out = redactEvent(event);
        expect(out.toolCalls[0].arguments.apiKey).toBe('[REDACTED]');
        expect(out.toolCalls[0].arguments.projectId).toBe('p');
        expect(out.observations[0].data.password).toBe('[REDACTED]');
        expect(out.observations[0].data.result).toBe('x');
    });

    test('envelope 元数据不被脱敏——token 关键词不误伤 tokenUsage / cached_prompt_tokens', () => {
        const event = {
            type: 'done',
            content: 'hi',
            stopReason: 'final',
            turnCount: 1,
            tokenUsage: { prompt: 5, completion: 3, total: 8, cached_prompt_tokens: 2 },
            ts: 't',
        };
        const out = redactEvent(event);
        expect(out.tokenUsage).toEqual({ prompt: 5, completion: 3, total: 8, cached_prompt_tokens: 2 });
    });

    test('observations 无 data 字段（失败观测）原样保留', () => {
        const event = {
            type: 'turn',
            turnIndex: 0,
            content: '',
            toolCalls: [],
            observations: [{ name: 't', ok: false, error: 'tool not allowed' }],
            ts: 't',
        };
        const out = redactEvent(event);
        expect(out.observations[0]).toEqual({ name: 't', ok: false, error: 'tool not allowed' });
    });
});

describe('sse.formatFrame', () => {
    test('产出合规 SSE 帧并通过契约校验', () => {
        const frame = formatFrame({ type: 'error', message: 'boom', ts: 't' });
        expect(frame.startsWith('event: error\n')).toBe(true);
        expect(frame.endsWith('\n\n')).toBe(true);
        expect(parseFrame(frame)).toEqual({ type: 'error', message: 'boom', ts: 't' });
    });

    test('不合契约的事件 fail-fast 抛错', () => {
        expect(() => formatFrame({ type: 'turn', turnIndex: 0 })).toThrow();
    });
});
