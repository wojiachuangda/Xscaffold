// [scaffold] ID: T5.4 | Date: 2026-05-18 | Description: Prometheus 文本格式指标导出（4 个核心指标）
'use strict';

const HISTOGRAM_BUCKETS_MS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000];
// V2.6 长会话：历史加载条数桶（与 ms 桶不同量纲，单独定义）
const HISTOGRAM_BUCKETS_COUNT = [1, 2, 5, 10, 20, 50, 100];

function createMetricsExporter() {
    const state = {
        workflowDuration: { sums: new Map(), counts: new Map(), buckets: new Map() },
        toolCalls: new Map(),
        llmTokens: new Map(),
        nodesExecution: new Map(),
        // V2.6：无 label 的条数直方图 + 截断计数器
        historyLoaded: { count: 0, sum: 0, buckets: new Map() },
        historyTruncated: 0,
    };

    return {
        recordWorkflowDuration: (workflow, status, ms) =>
            recordHistogram(state.workflowDuration, `${workflow}|${status}`, ms),
        incrToolCall: (tool) => incrCounter(state.toolCalls, tool),
        incrLLMTokens: (model, kind, count) => incrCounter(state.llmTokens, `${model}|${kind}`, count),
        incrNodeExecution: (type, status) => incrCounter(state.nodesExecution, `${type}|${status}`),
        observeHistoryLoaded: (count) => observeCountHistogram(state.historyLoaded, count),
        incrHistoryTruncated: () => {
            state.historyTruncated += 1;
        },
        render: () => renderPrometheus(state),
        snapshot: () => snapshot(state),
        summary: () => buildSummary(state),
    };
}

// 无 label 条数直方图观测：count/sum + 各桶累计（le 语义：≤le 的观测数）
function observeCountHistogram(hist, value) {
    hist.count += 1;
    hist.sum += value;
    for (const le of HISTOGRAM_BUCKETS_COUNT) {
        if (value <= le) {
            hist.buckets.set(le, (hist.buckets.get(le) || 0) + 1);
        }
    }
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
    renderCountHistogram(lines, 'llm_history_messages_loaded', state.historyLoaded, HISTOGRAM_BUCKETS_COUNT);
    lines.push('# TYPE llm_history_truncated_total counter');
    lines.push(`llm_history_truncated_total ${state.historyTruncated}`);
    return `${lines.join('\n')}\n`;
}

// 无 label 直方图渲染：le 是唯一标签，避免复用 renderHistogram 的 key↔label 位置拼接（空 label 会错位）
function renderCountHistogram(lines, name, hist, buckets) {
    lines.push(`# TYPE ${name} histogram`);
    for (const le of buckets) {
        lines.push(`${name}_bucket{le="${le}"} ${hist.buckets.get(le) || 0}`);
    }
    lines.push(`${name}_bucket{le="+Inf"} ${hist.count}`);
    lines.push(`${name}_sum ${hist.sum}`);
    lines.push(`${name}_count ${hist.count}`);
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
        historyLoaded: { count: state.historyLoaded.count, sum: state.historyLoaded.sum },
        historyTruncated: state.historyTruncated,
    };
}

module.exports = { createMetricsExporter };
