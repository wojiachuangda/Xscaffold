// [test] ID: PAM-6 | Date: 2026-05-19 | Description: externalAgentClient 纯函数单元测试（请求体组装 + 响应归一截断）
'use strict';

const { buildRequestBody, adaptResponse } = require('../../src/domain/projectAssistant/externalAgentClient');
const { REPLY_MAX_BYTES } = require('../../src/domain/projectAssistant/schemas/externalAgentCallSchema');

describe('externalAgentClient pure functions (PAM-6)', () => {
    test('buildRequestBody 组装 PLAN §6.3 固定结构', () => {
        const body = buildRequestBody({
            projectId: 'xscaffold',
            sessionId: 'xscaffold-main',
            instruction: '检查状态',
            expectation: '返回摘要',
        });
        expect(body).toEqual({
            sessionId: 'xscaffold-main',
            message: '检查状态',
            metadata: { projectId: 'xscaffold', source: 'xscaffold', expectation: '返回摘要' },
        });
    });

    test('buildRequestBody expectation 缺省为空串', () => {
        const body = buildRequestBody({ projectId: 'p', sessionId: 's', instruction: 'i' });
        expect(body.metadata.expectation).toBe('');
    });

    test('adaptResponse 兼容 reply / message 两种字段', () => {
        expect(adaptResponse({ reply: 'R' }).reply).toBe('R');
        expect(adaptResponse({ message: 'M' }).reply).toBe('M');
        expect(adaptResponse({}).reply).toBe('');
    });

    test('adaptResponse 对超长 reply 截断到上限', () => {
        const huge = 'x'.repeat(REPLY_MAX_BYTES + 100);
        expect(adaptResponse({ reply: huge }).reply).toHaveLength(REPLY_MAX_BYTES);
    });

    test('adaptResponse 对超大 raw 替换为 truncated 标记', () => {
        const bigPayload = { reply: 'ok', blob: 'y'.repeat(9000) };
        expect(adaptResponse(bigPayload).raw).toEqual({ truncated: true });
    });

    test('adaptResponse 小 raw 原样保留', () => {
        const small = { reply: 'ok', summary: 's' };
        expect(adaptResponse(small).raw).toEqual(small);
    });
});
