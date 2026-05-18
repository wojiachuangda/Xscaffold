// [scaffold] ID: T2.4 | Date: 2026-05-18 | Description: 任务状态机（AA-SEAC §3 约束 3：独立纯函数，对外仅暴露 transition）
'use strict';

const { ValidationError } = require('../infrastructure/errors/AppError');

const STATES = Object.freeze({
    PENDING: 'PENDING',
    RUNNING: 'RUNNING',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    STUCK: 'STUCK',
    TIMEOUT: 'TIMEOUT',
});

const ACTIONS = Object.freeze({
    START: 'START',
    SUCCEED: 'SUCCEED',
    FAIL: 'FAIL',
    TIMEOUT: 'TIMEOUT',
    STUCK: 'STUCK',
    RETRY: 'RETRY',
});

// 合法转换表
const TRANSITIONS = {
    PENDING: { START: STATES.RUNNING },
    RUNNING: {
        SUCCEED: STATES.SUCCESS,
        FAIL: STATES.FAILED,
        TIMEOUT: STATES.TIMEOUT,
        STUCK: STATES.STUCK,
    },
    FAILED: { RETRY: STATES.RUNNING },
    TIMEOUT: { RETRY: STATES.RUNNING },
    // SUCCESS / STUCK 为终态
    SUCCESS: {},
    STUCK: {},
};

const TERMINAL = new Set([STATES.SUCCESS, STATES.STUCK]);

/**
 * 纯函数：根据当前状态与动作推导下一状态
 * @param {string} currentState
 * @param {string} action
 * @returns {string} nextState
 */
function transition(currentState, action) {
    assertState(currentState);
    assertAction(action);
    const next = TRANSITIONS[currentState]?.[action];
    if (!next) {
        throw new ValidationError(`非法状态转换: ${currentState} --${action}--> ?`);
    }
    return next;
}

function assertState(s) {
    if (!Object.values(STATES).includes(s)) {
        throw new ValidationError(`未知状态: ${s}`);
    }
}

function assertAction(a) {
    if (!Object.values(ACTIONS).includes(a)) {
        throw new ValidationError(`未知动作: ${a}`);
    }
}

function isTerminal(state) {
    return TERMINAL.has(state);
}

module.exports = { STATES, ACTIONS, transition, isTerminal };
