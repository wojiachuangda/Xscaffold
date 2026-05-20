// [ui] ID: WEBUI-V2.1 | Date: 2026-05-20 | Description: Visibility-aware interval poller with consecutive failure degrade
'use strict';

import { showToast } from './utils.js';

const DEFAULT_INTERVAL_MS = 5000;
const MAX_CONSECUTIVE_FAILURES = 3;

let timerId = null;
let visibilityHandler = null;
let runningTick = null;
let failureCount = 0;
let stopped = false;
let pollerConfig = null;

export function startPoller(config) {
    pollerConfig = {
        intervalMs: config.intervalMs || DEFAULT_INTERVAL_MS,
        onTick: config.onTick,
    };
    stopped = false;
    failureCount = 0;
    attachVisibility();
    schedule();
    runTick();
}

export function stopPoller() {
    stopped = true;
    clearTimer();
    detachVisibility();
}

function schedule() {
    clearTimer();
    if (stopped || document.visibilityState === 'hidden') {
        return;
    }
    timerId = setTimeout(runTick, pollerConfig.intervalMs);
}

async function runTick() {
    if (stopped || runningTick) {
        return;
    }
    runningTick = pollerConfig.onTick();
    try {
        await runningTick;
        failureCount = 0;
    } catch (err) {
        handleFailure(err);
    } finally {
        runningTick = null;
        schedule();
    }
}

function handleFailure(err) {
    failureCount += 1;
    if (failureCount >= MAX_CONSECUTIVE_FAILURES) {
        stopped = true;
        clearTimer();
        showToast(`Auto refresh paused: ${err.message || 'network error'}`);
    }
}

function attachVisibility() {
    visibilityHandler = () => {
        if (document.visibilityState === 'visible' && !stopped) {
            runTick();
        } else {
            clearTimer();
        }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
}

function detachVisibility() {
    if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
    }
}

function clearTimer() {
    if (timerId) {
        clearTimeout(timerId);
        timerId = null;
    }
}
