// [ui] ID: WEBUI-V2-TOKENS | Date: 2026-05-20 | Description: Runtime view — token-styled list + detail; live probes from /healthz /readyz; per-runtime metrics/health/logs are mock placeholders
'use strict';

import { els } from '../lib/dom.js';
import { state } from '../lib/state.js';
import { escapeHtml } from '../lib/utils.js';

const RUNTIMES = [
    { id: 'rt_8f3a', name: 'ingest-worker-eu-1', region: 'eu-west-1', state: 'running', meta: '14d · eu-west-1', dot: 'dot-success' },
    { id: 'rt_b21c', name: 'vision-encoder-v3', region: 'us-east-1', state: 'running', meta: '2d 11h · us-east-1', dot: 'dot-success' },
    { id: 'rt_45e0', name: 'analytics-realtime', region: 'eu-west-1', state: 'idle', meta: '3h idle · eu-west-1', dot: 'dot-neutral' },
    { id: 'rt_9a01', name: 'archival-batch', region: 'us-east-1', state: 'stopped', meta: 'stopped 2d ago', dot: 'dot-neutral' },
];

const STATE_TEXT = { running: 'text-secondary', idle: 'text-tertiary', stopped: 'text-tertiary' };

const HEALTH = [
    { svc: 'http-api', lat: '12ms', state: 'healthy' },
    { svc: 'postgres-primary', lat: '4ms', state: 'healthy' },
    { svc: 'redis-stream', lat: '1ms', state: 'healthy' },
    { svc: 'object-store', lat: '48ms', state: 'degraded' },
    { svc: 'auth-broker', lat: '9ms', state: 'healthy' },
    { svc: 'metrics-pushgateway', lat: '18ms', state: 'healthy' },
];

const HEALTH_TONE = {
    healthy: { dot: 'dot-success', label: 'text-success' },
    degraded: { dot: 'dot-warning', label: 'text-warning' },
    down: { dot: 'dot-error', label: 'text-error' },
};

const LOGS = [
    ['14:02:11.842', 'i', '[ingestor] consumed batch=512 lag=8ms partition=p-4'],
    ['14:02:11.901', 'm', '[ingestor] checkpoint committed offset=8821044'],
    ['14:02:12.014', 'i', '[encoder] fanout to 3 workers · workload=0.37'],
    ['14:02:12.220', 's', '[scheduler] task t_91ab completed in 1.84s'],
    ['14:02:12.412', 'm', '[gc] young 18.2ms · old 0ms · heap 1.42G'],
    ['14:02:12.901', 'i', '[ingestor] consumed batch=487 lag=11ms partition=p-2'],
    ['14:02:13.020', 'w', '[object-store] elevated p99 latency 48ms (>20ms threshold)'],
    ['14:02:13.117', 'm', '[heartbeat] pulse n=128 jitter=±2.1ms'],
    ['14:02:13.244', 'i', '[encoder] vector cache hit-rate 0.94'],
    ['14:02:13.581', 's', '[scheduler] task t_91ac completed in 0.92s'],
    ['14:02:13.802', 'i', '[ingestor] consumed batch=503 lag=9ms partition=p-1'],
    ['14:02:14.014', 'm', '[gc] young 14.1ms · old 0ms · heap 1.43G'],
];

const LOG_CLS = { i: 'term-info', w: 'term-warn', e: 'term-err', s: 'term-ok', m: 'term-mute' };
const LOG_LBL = { i: 'INFO', w: 'WARN', e: 'ERR ', s: 'OK  ', m: '    ' };
const SPARK = [3, 5, 4, 6, 7, 5, 8, 6, 9, 7, 8, 6, 7, 9, 8, 7];

let selectedIndex = 0;

export function renderRuntime() {
    const target = RUNTIMES.findIndex((r) => r.id === state.selectedId);
    if (target >= 0) {
        selectedIndex = target;
    }
    els.viewBody.innerHTML = shellHtml();
    renderList();
    renderDetail();
}

function shellHtml() {
    return `
        <aside class="w-list bg-panel bd-r flex flex-col shrink-0">
            <div class="h-12 px-4 flex items-center justify-between bd-b">
                <span class="t-base">Runtimes</span>
                <button class="btn btn-ghost btn-icon focus-ring" title="New runtime"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
            </div>
            <div class="px-4 pt-3 pb-1 t-xs t-upper t-medium text-tertiary">Active · ${RUNTIMES.filter((r) => r.state === 'running').length}</div>
            <ul id="rt-list" class="flex-1 overflow-y-auto scroll-thin"></ul>
            <div class="px-4 py-2 bd-t t-xs text-tertiary flex items-center gap-2">
                <span class="dot ${probeDotClass()}"></span>
                <span>${probeSummary()}</span>
            </div>
        </aside>
        <main class="flex-1 overflow-hidden flex flex-col">
            <header class="h-12 px-6 flex items-center justify-between bd-b bg-panel shrink-0">
                <div class="flex items-center gap-3 min-w-0" id="rt-header"></div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary focus-ring">Restart</button>
                    <button class="btn btn-danger focus-ring">Stop</button>
                </div>
            </header>
            <div class="flex-1 overflow-y-auto scroll-thin">
                <section class="grid grid-cols-4 gap-px bg-line bd-b">
                    ${metricsHtml()}
                </section>
                <section class="grid grid-cols-5 gap-6 p-6">
                    <div class="card col-span-2">
                        <div class="h-8 px-4 flex items-center justify-between bd-b">
                            <div class="flex items-center gap-2">
                                <span class="t-sm t-medium">Health Checks</span>
                                <span class="t-xs text-tertiary">·</span>
                                <span class="t-xs text-secondary">${HEALTH.length} services</span>
                            </div>
                            <span class="t-xs text-secondary">${HEALTH.filter((h) => h.state === 'healthy').length} healthy · ${HEALTH.filter((h) => h.state !== 'healthy').length} degraded</span>
                        </div>
                        <ul id="rt-health" class="divide-bd"></ul>
                    </div>
                    <div class="card col-span-3 flex flex-col">
                        <div class="h-8 px-4 flex items-center justify-between bd-b shrink-0">
                            <div class="flex items-center gap-2">
                                <span class="t-sm t-medium">Live Logs</span>
                                <span class="dot dot-success ml-1"></span>
                                <span class="t-xs text-secondary">mock stream</span>
                            </div>
                        </div>
                        <pre id="rt-log" class="term flex-1 px-4 py-3 overflow-y-auto scroll-thin m-0 max-h-list"></pre>
                    </div>
                </section>
            </div>
        </main>
    `;
}

function probeDotClass() {
    return state.runtime.ready?.status === 'ready' ? 'dot-success' : 'dot-warning';
}

function probeSummary() {
    const health = state.runtime.health?.status || 'unknown';
    const ready = state.runtime.ready?.status || 'unknown';
    return `live probes · health=${health} · ready=${ready}`;
}

function renderList() {
    const ul = document.getElementById('rt-list');
    ul.innerHTML = RUNTIMES.map((r, i) => `
        <li class="row cursor-pointer focus-ring ${i === selectedIndex ? 'row-sel' : ''}" data-index="${i}" tabindex="0">
            <div class="flex items-center gap-3 min-w-0">
                <span class="dot ${r.dot} shrink-0"></span>
                <span class="t-sm t-medium t-truncate">${escapeHtml(r.name)}</span>
            </div>
            <div class="flex items-center justify-between mt-1 pl-4">
                <span class="t-xs text-secondary t-truncate">${escapeHtml(r.meta)}</span>
                <span class="t-xs t-medium ${STATE_TEXT[r.state]}">${r.state}</span>
            </div>
        </li>
    `).join('');
    ul.querySelectorAll('li').forEach((li) => {
        li.addEventListener('click', () => {
            selectedIndex = Number(li.dataset.index);
            state.selectedId = RUNTIMES[selectedIndex].id;
            renderDetail();
            ul.querySelectorAll('li').forEach((n, k) => n.classList.toggle('row-sel', k === selectedIndex));
        });
    });
}

function renderDetail() {
    const r = RUNTIMES[selectedIndex];
    document.getElementById('rt-header').innerHTML = `
        <span class="dot ${r.dot}"></span>
        <h1 class="t-base t-truncate">${escapeHtml(r.name)}</h1>
        <span class="t-xs t-medium ${STATE_TEXT[r.state]}">${r.state}</span>
        <span class="t-xs text-tertiary">·</span>
        <span class="t-xs text-secondary t-mono">${escapeHtml(r.id)}</span>
    `;
    renderHealth();
    renderSpark();
    renderLogs();
}

function metricsHtml() {
    return `
        <div class="bg-panel px-6 py-4">
            <div class="t-xs t-upper t-medium text-tertiary mb-1">Uptime</div>
            <div class="t-base t-num">14d 06h</div>
            <div class="t-xs text-secondary mt-1">mock · since 2026-05-06</div>
        </div>
        <div class="bg-panel px-6 py-4">
            <div class="t-xs t-upper t-medium text-tertiary mb-1">Heartbeat</div>
            <div class="t-base t-num">128 <span class="t-xs text-tertiary font-normal">/min</span></div>
            <div class="flex items-end gap-1 mt-2 h-6" id="rt-spark"></div>
        </div>
        <div class="bg-panel px-6 py-4">
            <div class="t-xs t-upper t-medium text-tertiary mb-1">Workload</div>
            <div class="t-base t-num">37<span class="t-xs text-tertiary font-normal">%</span></div>
            <div class="bar mt-2"><div class="bar-fill" style="width:37%"></div></div>
        </div>
        <div class="bg-panel px-6 py-4">
            <div class="t-xs t-upper t-medium text-tertiary mb-1">Memory</div>
            <div class="t-base t-num">1.42 <span class="t-xs text-tertiary font-normal">/ 4 GB</span></div>
            <div class="bar mt-2"><div class="bar-fill bar-fill--secondary" style="width:35.5%"></div></div>
        </div>
    `;
}

function renderHealth() {
    const ul = document.getElementById('rt-health');
    ul.innerHTML = HEALTH.map((h) => {
        const tone = HEALTH_TONE[h.state];
        return `
            <li class="px-4 py-3 flex items-center justify-between hover:bg-hover">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="dot ${tone.dot}"></span>
                    <span class="t-sm t-truncate">${escapeHtml(h.svc)}</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="t-xs t-mono text-secondary">${h.lat}</span>
                    <span class="t-xs t-medium w-16 text-right ${tone.label}">${h.state}</span>
                </div>
            </li>
        `;
    }).join('');
}

function renderSpark() {
    const w = document.getElementById('rt-spark');
    w.innerHTML = '';
    const max = Math.max(...SPARK);
    SPARK.forEach((v) => {
        const b = document.createElement('div');
        b.className = 'w-1 rounded-sm bg-n400';
        b.style.height = `${(v / max) * 100}%`;
        w.appendChild(b);
    });
}

function renderLogs() {
    const pre = document.getElementById('rt-log');
    pre.innerHTML = LOGS.map(([t, c, msg]) =>
        `<span class="term-time">${t}</span> <span class="${LOG_CLS[c]}">${LOG_LBL[c]}</span> <span class="${LOG_CLS[c]}">${escapeHtml(msg)}</span>`,
    ).join('\n');
    pre.scrollTop = pre.scrollHeight;
}
