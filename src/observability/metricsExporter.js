// [scaffold] ID: T5.4 | Date: 2026-05-18 | Description: Prometheus 文本格式指标导出（4 个核心指标）
'use strict';

const HISTOGRAM_BUCKETS_MS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];

function createMetricsExporter() {
    const state = {
        workflowDuration: { sums: new Map(), counts: new Map(), buckets: new Map() },
        toolCalls: new Map(),
        llmTokens: new Map(),
        nodesExecution: new Map(),
    };

    return {
        recordWorkflowDuration: (workflow, status, ms) =>
            recordHistogram(state.workflowDuration, `${workflow}|${status}`, ms),
        incrToolCall: (tool) => incrCounter(state.toolCalls, tool),
        incrLLMTokens: (model, kind, count) => incrCounter(state.llmTokens, `${model}|${kind}`, count),
        incrNodeExecution: (type, status) => incrCounter(state.nodesExecution, `${type}|${status}`),
        render: () => renderPrometheus(state),
        snapshot: () => snapshot(state),
        summary: () => buildSummary(state),
    };
}

function sumValues(map) {
    let total = 0;
    for (const value of map.values()) {
        total += value;
    }
    return total;
}

// 聚合给 runtime 视图 Engine Activity 用的 JSON（避免前端解析 Prometheus 文本）
function buildSummary(state) {
    const workflowRuns = sumValues(state.workflowDuration.counts);
    const durationSum = sumValues(state.workflowDuration.sums);
    return {
        nodesExecuted: sumValues(state.nodesExecution),
        toolCalls: sumValues(state.toolCalls),
        llmTokens: sumValues(state.llmTokens),
        workflowRuns,
        workflowDurationAvgMs: workflowRuns > 0 ? Math.round(durationSum / workflowRuns) : 0,
    };
}

function incrCounter(map, key, by = 1) {
    map.set(key, (map.get(key) || 0) + by);
}

function recordHistogram(hist, key, value) {
    hist.counts.set(key, (hist.counts.get(key) || 0) + 1);
    hist.sums.set(key, (hist.sums.get(key) || 0) + value);
    let bucketMap = hist.buckets.get(key);
    if (!bucketMap) {
        bucketMap = new Map();
        hist.buckets.set(key, bucketMap);
    }
    for (const le of HISTOGRAM_BUCKETS_MS) {
        if (value <= le) {
            bucketMap.set(le, (bucketMap.get(le) || 0) + 1);
        }
    }
}

function renderPrometheus(state) {
    const lines = [];
    renderHistogram(lines, 'workflow_duration_ms', state.workflowDuration, ['workflow', 'status']);
    renderCounter(lines, 'tool_call_total', state.toolCalls, ['tool']);
    renderCounter(lines, 'llm_tokens_total', state.llmTokens, ['model', 'kind']);
    renderCounter(lines, 'nodes_execution_total', state.nodesExecution, ['type', 'status']);
    return `${lines.join('\n')}\n`;
}

function renderCounter(lines, name, map, labelKeys) {
    lines.push(`# TYPE ${name} counter`);
    for (const [key, value] of map.entries()) {
        lines.push(`${name}${formatLabels(labelKeys, key)} ${value}`);
    }
}

function renderHistogram(lines, name, hist, labelKeys) {
    lines.push(`# TYPE ${name} histogram`);
    for (const [key, count] of hist.counts.entries()) {
        const labels = formatLabels(labelKeys, key);
        const sum = hist.sums.get(key) || 0;
        const buckets = hist.buckets.get(key) || new Map();
        for (const le of HISTOGRAM_BUCKETS_MS) {
            const bucketCount = buckets.get(le) || 0;
            lines.push(`${name}_bucket${formatLabels(labelKeys.concat('le'), `${key}|${le}`)} ${bucketCount}`);
        }
        lines.push(`${name}_bucket${formatLabels(labelKeys.concat('le'), `${key}|+Inf`)} ${count}`);
        lines.push(`${name}_sum${labels} ${sum}`);
        lines.push(`${name}_count${labels} ${count}`);
    }
}

function formatLabels(keys, joinedValue) {
    const values = String(joinedValue).split('|');
    const pairs = keys.map((k, i) => `${k}="${escapeLabel(values[i] ?? '')}"`);
    return `{${pairs.join(',')}}`;
}

function escapeLabel(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function snapshot(state) {
    return {
        workflowDuration: Object.fromEntries(state.workflowDuration.counts),
        toolCalls: Object.fromEntries(state.toolCalls),
        llmTokens: Object.fromEntries(state.llmTokens),
        nodesExecution: Object.fromEntries(state.nodesExecution),
    };
}

module.exports = { createMetricsExporter };
