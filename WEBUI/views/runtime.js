// [ui] ID: WEBUI-V2.3-RUNTIME | Date: 2026-05-21 | Description: Runtime 单页健康面板——Status(/healthz+/readyz) + Engine(/runtime/metrics) + Health + Live Logs(/runtime/logs/stream SSE)；自管刷新 + 离开自清理
'use strict';

import { api } from '../lib/api.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { streamSse } from '../lib/sseClient.js';
import { escapeHtml } from '../lib/utils.js';

const REFRESH_MS = 5000;
const MAX_LOG_DOM = 500;
const LEVEL_CLS = { info: 'term-info', warn: 'term-warn', error: 'term-err', fatal: 'term-err', debug: 'term-mute', trace: 'term-mute' };
const LEVEL_LBL = { info: 'INFO', warn: 'WARN', error: 'ERR ', fatal: 'FATL', debug: 'DBG ', trace: 'TRC ' };

let logsAbort = null;
let refreshTimer = null;
let paused = false;

export function renderRuntime() {
    cleanup();
    paused = false;
    els.viewBody.innerHTML = shellHtml();
    bindPause();
    updateStatus();
    updateMetrics();
    startLogStream();
    refreshTimer = setInterval(tick, REFRESH_MS);
}

function tick() {
    if (state.view !== 'runtime') {
        cleanup(); // 离开 runtime → 5s 内自清理 SSE + 定时器
        return;
    }
    updateStatus();
    updateMetrics();
}

function cleanup() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    if (logsAbort) {
        logsAbort.abort();
        logsAbort = null;
    }
}

function shellHtml() {
    return `
        <main class="flex-1 overflow-hidden flex flex-col">
            <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0">
                <div class="flex items-center gap-4 min-w-0">
                    <h1 class="t-base">Runtime</h1>
                    <span class="flex items-center gap-2">
                        <span id="rt-status-dot" class="dot dot-neutral"></span>
                        <span id="rt-status-text" class="t-sm text-secondary">…</span>
                    </span>
                </div>
                <span id="rt-uptime" class="t-xs text-tertiary t-mono">uptime —</span>
            </header>
            <div class="flex-1 overflow-y-auto scroll-thin">
                <section class="px-6 pt-6">
                    <div class="grid grid-cols-4 gap-4">
                        ${valCard('Uptime', '<span id="rt-uptime-val" class="t-lg t-num">—</span>', 'process uptime')}
                        ${dotCard('Process', 'rt-proc', 'healthz · readyz')}
                        ${dotCard('Database', 'rt-db', 'readiness probe')}
                        ${dotCard('Queue', 'rt-q', 'readiness probe')}
                    </div>
                </section>
                <section class="px-6 pt-6">
                    <div class="flex items-baseline justify-between mb-3">
                        <h2 class="t-sm t-medium">Engine Activity</h2>
                        <span class="t-xs text-tertiary">since process start</span>
                    </div>
                    <div class="grid grid-cols-4 gap-4">
                        ${numCard('Nodes executed', 'rt-nodes')}
                        ${numCard('Tool calls', 'rt-tools')}
                        ${numCard('LLM tokens', 'rt-tokens')}
                        ${numCard('Workflow duration avg', 'rt-wfdur')}
                    </div>
                </section>
                <section class="px-6 pt-6">
                    <div class="flex items-baseline justify-between mb-3">
                        <h2 class="t-sm t-medium">Health Checks</h2>
                        <span class="t-xs text-tertiary">readiness probes</span>
                    </div>
                    <div class="card"><ul class="divide-bd">
                        ${healthRow('Database', 'sqlite', 'rt-health-db')}
                        ${healthRow('Job Queue', 'in-memory', 'rt-health-q')}
                    </ul></div>
                </section>
                <section class="px-6 py-6">
                    <div class="flex items-baseline justify-between mb-3">
                        <h2 class="t-sm t-medium">Live Logs</h2>
                        <span class="t-xs text-tertiary">ring buffer · 实时 SSE</span>
                    </div>
                    <div class="card flex flex-col">
                        <div class="h-8 px-4 flex items-center justify-between bd-b shrink-0">
                            <div class="flex items-center gap-2"><span class="dot dot-success"></span><span class="t-xs text-secondary">streaming</span></div>
                            <button id="rt-log-pause" class="tab focus-ring">Pause</button>
                        </div>
                        <pre id="rt-log" class="term flex-1 px-4 py-3 overflow-y-auto scroll-thin m-0 max-h-list"></pre>
                    </div>
                </section>
            </div>
        </main>
    `;
}

function valCard(label, valHtml, hint) {
    return `<div class="card p-4"><div class="t-xs t-upper t-medium text-tertiary mb-2">${label}</div>${valHtml}<div class="t-xs text-secondary mt-1">${hint}</div></div>`;
}

function dotCard(label, idPrefix, hint) {
    return `<div class="card p-4"><div class="t-xs t-upper t-medium text-tertiary mb-2">${label}</div><div class="flex items-center gap-2"><span id="${idPrefix}-dot" class="dot dot-neutral"></span><span id="${idPrefix}-text" class="t-lg">…</span></div><div class="t-xs text-secondary mt-1">${hint}</div></div>`;
}

function numCard(label, id) {
    return `<div class="card p-4"><div class="t-xs t-upper t-medium text-tertiary mb-2">${label}</div><div id="${id}" class="t-lg t-num t-mono">—</div></div>`;
}

function healthRow(name, kind, idPrefix) {
    return `<li class="px-4 py-3 flex items-center justify-between"><div class="flex items-center gap-3"><span id="${idPrefix}-dot" class="dot dot-neutral"></span><span class="t-sm">${name}</span><span class="t-xs text-tertiary">${kind}</span></div><div class="flex items-center gap-6"><span class="t-xs text-tertiary">latency</span><span class="t-xs t-mono text-secondary w-16 text-right">—</span><span id="${idPrefix}-text" class="t-xs t-medium w-16 text-right text-tertiary">…</span></div></li>`;
}

function updateStatus() {
    const health = state.runtime?.health;
    const ready = state.runtime?.ready;
    const dbReady = ready?.checks?.db === true;
    const qReady = ready?.checks?.queue === true;
    const healthy = Boolean(health) && Boolean(ready) && ready.status === 'ready';
    const uptime = health?.uptime;
    setText('rt-uptime', uptime == null ? 'uptime —' : `uptime ${formatUptime(uptime)}`);
    setText('rt-uptime-val', uptime == null ? '—' : formatUptime(uptime));
    setDot('rt-status-dot', healthy ? 'dot-success' : (health ? 'dot-warning' : 'dot-error'));
    setText('rt-status-text', healthy ? 'Healthy' : (health ? 'Degraded' : 'Down'));
    setDot('rt-proc-dot', health ? 'dot-success' : 'dot-error');
    setText('rt-proc-text', health ? 'Healthy' : 'Down');
    setReadyState('rt-db', dbReady);
    setReadyState('rt-q', qReady);
    setHealthRow('rt-health-db', dbReady);
    setHealthRow('rt-health-q', qReady);
}

function setReadyState(idPrefix, ok) {
    setDot(`${idPrefix}-dot`, ok ? 'dot-success' : 'dot-error');
    setText(`${idPrefix}-text`, ok ? 'Ready' : 'Not ready');
}

function setHealthRow(idPrefix, ok) {
    setDot(`${idPrefix}-dot`, ok ? 'dot-success' : 'dot-error');
    const el = document.getElementById(`${idPrefix}-text`);
    if (el) {
        el.textContent = ok ? 'ready' : 'not ready';
        el.className = `t-xs t-medium w-16 text-right ${ok ? 'text-success' : 'text-error'}`;
    }
}

async function updateMetrics() {
    let metrics;
    try {
        metrics = (await api('/runtime/metrics')).data;
    } catch (_err) {
        return; // 保留上次值
    }
    if (state.view !== 'runtime' || !metrics) {
        return;
    }
    setText('rt-nodes', fmtNum(metrics.nodesExecuted));
    setText('rt-tools', fmtNum(metrics.toolCalls));
    setText('rt-tokens', fmtNum(metrics.llmTokens));
    setText('rt-wfdur', `${fmtNum(metrics.workflowDurationAvgMs)} ms`);
}

function startLogStream() {
    const controller = new AbortController();
    logsAbort = controller;
    streamSse('/runtime/logs/stream', {
        method: 'GET',
        signal: controller.signal,
        handlers: { onLog: appendLog },
    }).catch(() => {
        /* abort / 网络结束 —— 忽略 */
    });
}

function appendLog(entry) {
    if (state.view !== 'runtime') {
        return;
    }
    const pre = document.getElementById('rt-log');
    if (!pre) {
        return;
    }
    const cls = LEVEL_CLS[entry.level] || 'term-mute';
    const lbl = LEVEL_LBL[entry.level] || '    ';
    const line = document.createElement('div');
    line.innerHTML = `<span class="term-time">${escapeHtml(logTime(entry.ts))}</span> <span class="${cls}">${lbl}</span> <span class="${cls}">${escapeHtml(entry.msg || '')}</span>`;
    pre.appendChild(line);
    while (pre.childElementCount > MAX_LOG_DOM) {
        pre.removeChild(pre.firstChild);
    }
    if (!paused) {
        pre.scrollTop = pre.scrollHeight;
    }
}

function bindPause() {
    const btn = document.getElementById('rt-log-pause');
    btn?.addEventListener('click', () => {
        paused = !paused;
        btn.textContent = paused ? 'Resume' : 'Pause';
        btn.classList.toggle('is-active', paused);
        if (!paused) {
            const pre = document.getElementById('rt-log');
            if (pre) {
                pre.scrollTop = pre.scrollHeight;
            }
        }
    });
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

function setDot(id, cls) {
    const el = document.getElementById(id);
    if (el) {
        el.className = `dot ${cls}`;
    }
}

function fmtNum(n) {
    return Number(n || 0).toLocaleString('en-US');
}

function logTime(ts) {
    const s = String(ts || '');
    return s.length >= 23 ? s.slice(11, 23) : s;
}

function formatUptime(seconds) {
    const sec = Math.floor(seconds);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return d > 0 ? `${d}d ${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(ss)}`;
}
