// [ui] ID: WEBUI-V2.3-RUNTIME | Date: 2026-05-21 | Description: Runtime 三栏健康面板——左栏章节导航(Overview/Engine/Health/Live Logs) + 主区显示选中章节；Live Logs 走 SSE，自管刷新 + 离开自清理
'use strict';

import { api } from '../lib/api.js';
import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { streamSse } from '../lib/sseClient.js';
import { escapeHtml } from '../lib/utils.js';

const REFRESH_MS = 5000;
const MAX_LOG_DOM = 500;
const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'engine', label: 'Engine Activity' },
    { id: 'health', label: 'Health Checks' },
    { id: 'logs', label: 'Live Logs' },
];
const LEVEL_CLS = { info: 'term-info', warn: 'term-warn', error: 'term-err', fatal: 'term-err', debug: 'term-mute', trace: 'term-mute' };
const LEVEL_LBL = { info: 'INFO', warn: 'WARN', error: 'ERR ', fatal: 'FATL', debug: 'DBG ', trace: 'TRC ' };

let selectedSection = 'overview';
let logsAbort = null;
let refreshTimer = null;
let paused = false;

export function renderRuntime() {
    cleanup();
    els.viewBody.innerHTML = shellHtml();
    renderSectionList();
    selectSection(selectedSection);
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
    stopLogStream();
}

function shellHtml() {
    return `
        <aside class="w-list bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center justify-between bd-b">
                <span class="t-base">Runtime</span>
                <span class="flex items-center gap-2"><span id="rt-nav-dot" class="dot dot-neutral"></span></span>
            </div>
            <ul id="rt-sections" class="flex-1 overflow-y-auto scroll-thin"></ul>
            <div class="px-4 py-2 bd-t t-xs text-tertiary">single process · live</div>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0">
                <h1 id="rt-section-title" class="t-base">Overview</h1>
                <div class="flex items-center gap-3">
                    <span class="flex items-center gap-2"><span id="rt-status-dot" class="dot dot-neutral"></span><span id="rt-status-text" class="t-sm text-secondary">…</span></span>
                    <span class="t-xs text-tertiary">·</span>
                    <span id="rt-uptime" class="t-xs text-tertiary t-mono">uptime —</span>
                </div>
            </header>
            <div id="rt-main" class="flex-1 min-h-0 flex flex-col overflow-hidden"></div>
        </main>
    `;
}

function renderSectionList() {
    const ul = document.getElementById('rt-sections');
    if (!ul) {
        return;
    }
    ul.innerHTML = SECTIONS.map((s) => sectionRowHtml(s)).join('');
    ul.querySelectorAll('li[data-id]').forEach((li) => {
        li.addEventListener('click', () => selectSection(li.dataset.id));
    });
}

function sectionRowHtml(section) {
    const selected = section.id === selectedSection;
    return `
        <li class="row cursor-pointer focus-ring ${selected ? 'row-sel' : ''}" data-id="${section.id}" tabindex="0">
            <span class="t-sm t-medium">${section.label}</span>
        </li>
    `;
}

function selectSection(id) {
    selectedSection = id;
    document.querySelectorAll('#rt-sections li[data-id]').forEach((li) => {
        li.classList.toggle('row-sel', li.dataset.id === id);
    });
    const title = SECTIONS.find((s) => s.id === id);
    setText('rt-section-title', title ? title.label : 'Runtime');
    const main = document.getElementById('rt-main');
    if (main) {
        main.innerHTML = sectionContentHtml(id);
    }
    if (id === 'logs') {
        bindPause();
        startLogStream();
    } else {
        stopLogStream();
    }
    updateStatus();
    updateMetrics();
}

function sectionContentHtml(id) {
    if (id === 'engine') {
        return wrap(engineHtml());
    }
    if (id === 'health') {
        return wrap(healthHtml());
    }
    if (id === 'logs') {
        return logsHtml();
    }
    return wrap(overviewHtml());
}

function wrap(inner) {
    return `<div class="flex-1 overflow-y-auto scroll-thin p-6">${inner}</div>`;
}

function overviewHtml() {
    return `
        <div class="grid grid-cols-2 gap-4">
            ${valCard('Uptime', '<span id="rt-uptime-val" class="t-lg t-num">—</span>', 'process uptime')}
            ${dotCard('Process', 'rt-proc', 'healthz · readyz')}
            ${dotCard('Database', 'rt-db', 'readiness probe')}
            ${dotCard('Queue', 'rt-q', 'readiness probe')}
        </div>
    `;
}

function engineHtml() {
    return `
        <div class="t-xs text-tertiary mb-3">since process start</div>
        <div class="grid grid-cols-2 gap-4">
            ${numCard('Nodes executed', 'rt-nodes')}
            ${numCard('Tool calls', 'rt-tools')}
            ${numCard('LLM tokens', 'rt-tokens')}
            ${numCard('Workflow duration avg', 'rt-wfdur')}
        </div>
    `;
}

function healthHtml() {
    return `
        <div class="card"><ul class="divide-bd">
            ${healthRow('Database', 'sqlite', 'rt-health-db')}
            ${healthRow('Job Queue', 'in-memory', 'rt-health-q')}
        </ul></div>
    `;
}

function logsHtml() {
    return `
        <div class="flex-1 min-h-0 flex flex-col p-6">
            <div class="card flex-1 min-h-0 flex flex-col">
                <div class="h-8 px-4 flex items-center justify-between bd-b shrink-0">
                    <div class="flex items-center gap-2"><span class="dot dot-success"></span><span class="t-xs text-secondary">ring buffer · 实时 SSE</span></div>
                    <button id="rt-log-pause" class="tab focus-ring">Pause</button>
                </div>
                <pre id="rt-log" class="term flex-1 min-h-0 px-4 py-3 overflow-y-auto scroll-thin m-0"></pre>
            </div>
        </div>
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
    const overallDot = healthy ? 'dot-success' : (health ? 'dot-warning' : 'dot-error');
    setDot('rt-nav-dot', overallDot);
    setDot('rt-status-dot', overallDot);
    setText('rt-status-text', healthy ? 'Healthy' : (health ? 'Degraded' : 'Down'));
    setText('rt-uptime', uptime == null ? 'uptime —' : `uptime ${formatUptime(uptime)}`);
    setText('rt-uptime-val', uptime == null ? '—' : formatUptime(uptime));
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
    if (selectedSection !== 'engine') {
        return; // 仅 Engine 章节需要
    }
    let metrics;
    try {
        metrics = (await api('/runtime/metrics')).data;
    } catch (_err) {
        return;
    }
    if (state.view !== 'runtime' || selectedSection !== 'engine' || !metrics) {
        return;
    }
    setText('rt-nodes', fmtNum(metrics.nodesExecuted));
    setText('rt-tools', fmtNum(metrics.toolCalls));
    setText('rt-tokens', fmtNum(metrics.llmTokens));
    setText('rt-wfdur', `${fmtNum(metrics.workflowDurationAvgMs)} ms`);
}

function startLogStream() {
    stopLogStream();
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

function stopLogStream() {
    if (logsAbort) {
        logsAbort.abort();
        logsAbort = null;
    }
}

function appendLog(entry) {
    if (state.view !== 'runtime' || selectedSection !== 'logs') {
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
    if (!btn) {
        return;
    }
    paused = false;
    btn.addEventListener('click', () => {
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
