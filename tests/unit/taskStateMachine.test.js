// [test] ID: T2.4 | Date: 2026-05-18 | Description: 状态机纯函数测试（所有合法 + 所有非法转换）
'use strict';

const { STATES, ACTIONS, transition, isTerminal } = require('../../src/workflowEngine/taskStateMachine');
const { ValidationError } = require('../../src/infrastructure/errors/AppError');

describe('合法转换', () => {
    test('PENDING --START--> RUNNING', () => {
        expect(transition(STATES.PENDING, ACTIONS.START)).toBe(STATES.RUNNING);
    });

    test('RUNNING --SUCCEED--> SUCCESS', () => {
        expect(transition(STATES.RUNNING, ACTIONS.SUCCEED)).toBe(STATES.SUCCESS);
    });

    test('RUNNING --FAIL--> FAILED', () => {
        expect(transition(STATES.RUNNING, ACTIONS.FAIL)).toBe(STATES.FAILED);
    });

    test('RUNNING --TIMEOUT--> TIMEOUT', () => {
        expect(transition(STATES.RUNNING, ACTIONS.TIMEOUT)).toBe(STATES.TIMEOUT);
    });

    test('RUNNING --STUCK--> STUCK', () => {
        expect(transition(STATES.RUNNING, ACTIONS.STUCK)).toBe(STATES.STUCK);
    });

    test('FAILED --RETRY--> RUNNING', () => {
        expect(transition(STATES.FAILED, ACTIONS.RETRY)).toBe(STATES.RUNNING);
    });

    test('TIMEOUT --RETRY--> RUNNING', () => {
        expect(transition(STATES.TIMEOUT, ACTIONS.RETRY)).toBe(STATES.RUNNING);
    });
});

describe('非法转换', () => {
    test('SUCCESS 为终态，任何动作均拒绝', () => {
        expect(() => transition(STATES.SUCCESS, ACTIONS.START)).toThrow(ValidationError);
        expect(() => transition(STATES.SUCCESS, ACTIONS.FAIL)).toThrow(ValidationError);
    });

    test('STUCK 为终态', () => {
        expect(() => transition(STATES.STUCK, ACTIONS.RETRY)).toThrow(ValidationError);
    });

    test('PENDING 不能直接 SUCCEED', () => {
        expect(() => transition(STATES.PENDING, ACTIONS.SUCCEED)).toThrow(ValidationError);
    });

    test('RUNNING 不能 START', () => {
        expect(() => transition(STATES.RUNNING, ACTIONS.START)).toThrow(ValidationError);
    });

    test('未知状态抛错', () => {
        expect(() => transition('WAT', ACTIONS.START)).toThrow(/未知状态/);
    });

    test('未知动作抛错', () => {
        expect(() => transition(STATES.PENDING, 'YO')).toThrow(/未知动作/);
    });
});

describe('isTerminal', () => {
    test('SUCCESS 和 STUCK 是终态', () => {
        expect(isTerminal(STATES.SUCCESS)).toBe(true);
        expect(isTerminal(STATES.STUCK)).toBe(true);
    });

    test('其他状态不是终态', () => {
        [STATES.PENDING, STATES.RUNNING, STATES.FAILED, STATES.TIMEOUT].forEach((s) => {
            expect(isTerminal(s)).toBe(false);
        });
    });
});
