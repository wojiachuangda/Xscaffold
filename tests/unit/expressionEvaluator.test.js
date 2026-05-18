// [test] ID: T2.3 | Date: 2026-05-18 | Description: expressionEvaluator 单元测试（≥10 case + 禁 eval 验证）
'use strict';

const { renderTemplate, evaluateBoolean, resolvePath } = require('../../src/workflowEngine/expressionEvaluator');
const { ValidationError } = require('../../src/infrastructure/errors/AppError');

describe('resolvePath', () => {
    test('多级路径', () => {
        expect(resolvePath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
    });

    test('数组下标', () => {
        expect(resolvePath({ items: [10, 20] }, 'items.1')).toBe(20);
    });

    test('不存在返回 undefined', () => {
        expect(resolvePath({}, 'a.b')).toBeUndefined();
    });
});

describe('renderTemplate', () => {
    test('简单替换', () => {
        expect(renderTemplate('Hello {{name}}', { name: 'Alice' })).toBe('Hello Alice');
    });

    test('多占位符', () => {
        expect(renderTemplate('{{a}}+{{b}}', { a: 1, b: 2 })).toBe('1+2');
    });

    test('对象自动 JSON 序列化', () => {
        expect(renderTemplate('{{obj}}', { obj: { x: 1 } })).toBe('{"x":1}');
    });

    test('缺失值为空字符串', () => {
        expect(renderTemplate('[{{missing}}]', {})).toBe('[]');
    });
});

describe('evaluateBoolean - 比较运算', () => {
    const ctx = { a: { score: 0.7 }, name: 'alice', flag: true, n: 0 };

    test('数值大于', () => {
        expect(evaluateBoolean('{{a.score}} > 0.5', ctx)).toBe(true);
    });

    test('数值不大于', () => {
        expect(evaluateBoolean('{{a.score}} > 0.9', ctx)).toBe(false);
    });

    test('字符串相等', () => {
        expect(evaluateBoolean('{{name}} == "alice"', ctx)).toBe(true);
    });

    test('字符串不等', () => {
        expect(evaluateBoolean('{{name}} != "bob"', ctx)).toBe(true);
    });

    test('布尔字面量', () => {
        expect(evaluateBoolean('{{flag}} == true', ctx)).toBe(true);
    });

    test('null 比较', () => {
        expect(evaluateBoolean('{{missing}} == null', ctx)).toBe(true);
    });

    test('数值小于等于', () => {
        expect(evaluateBoolean('{{n}} <= 0', ctx)).toBe(true);
    });
});

describe('evaluateBoolean - 逻辑组合', () => {
    const ctx = { x: 5, y: 'ok' };

    test('AND', () => {
        expect(evaluateBoolean('{{x}} > 0 && {{y}} == "ok"', ctx)).toBe(true);
    });

    test('OR', () => {
        expect(evaluateBoolean('{{x}} < 0 || {{y}} == "ok"', ctx)).toBe(true);
    });

    test('NOT', () => {
        expect(evaluateBoolean('!({{x}} < 0)', ctx)).toBe(true);
    });

    test('括号优先级', () => {
        expect(evaluateBoolean('({{x}} > 10 || {{x}} > 0) && {{y}} == "ok"', ctx)).toBe(true);
    });
});

describe('evaluateBoolean - 安全性', () => {
    test('禁止 JS 任意代码（process 不是合法 token）', () => {
        expect(() => evaluateBoolean('process.exit(1)', {})).toThrow(ValidationError);
    });

    test('禁止函数调用', () => {
        expect(() => evaluateBoolean('alert(1)', {})).toThrow(ValidationError);
    });

    test('非法残留 token', () => {
        expect(() => evaluateBoolean('1 == 1 garbage', {})).toThrow(ValidationError);
    });

    test('括号未闭合', () => {
        expect(() => evaluateBoolean('(1 == 1', {})).toThrow(ValidationError);
    });
});
