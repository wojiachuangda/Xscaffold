// [test] ID: T5.3 | Date: 2026-05-18 | Description: profileHash 工具测试
'use strict';

const { computeProfileHash } = require('../../src/observability/profileHash');

describe('computeProfileHash', () => {
    test('相同 agent 产生相同 hash', () => {
        const a = computeProfileHash({ model: 'gpt-4', tools: ['x', 'y'] });
        const b = computeProfileHash({ model: 'gpt-4', tools: ['y', 'x'] });
        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    test('model 变化 → hash 变化', () => {
        const a = computeProfileHash({ model: 'gpt-4' });
        const b = computeProfileHash({ model: 'gpt-3.5' });
        expect(a).not.toBe(b);
    });

    test('tools 集合变化 → hash 变化', () => {
        const a = computeProfileHash({ model: 'gpt-4', tools: ['a'] });
        const b = computeProfileHash({ model: 'gpt-4', tools: ['a', 'b'] });
        expect(a).not.toBe(b);
    });

    test('systemPrompt 变化 → hash 变化', () => {
        const a = computeProfileHash({ model: 'gpt-4', systemPrompt: 'v1' });
        const b = computeProfileHash({ model: 'gpt-4', systemPrompt: 'v2' });
        expect(a).not.toBe(b);
    });

    test('null/undefined 输入返回 null', () => {
        expect(computeProfileHash(null)).toBeNull();
        expect(computeProfileHash(undefined)).toBeNull();
    });
});
