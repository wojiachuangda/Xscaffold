// [test] ID: T5.4 | Date: 2026-05-18 | Description: metricsExporter 单元测试
'use strict';

const { createMetricsExporter } = require('../../src/observability/metricsExporter');

describe('metricsExporter', () => {
    test('counter 累加', () => {
        const m = createMetricsExporter();
        m.incrToolCall('addNumbers');
        m.incrToolCall('addNumbers');
        m.incrToolCall('sendEmail');
        const snap = m.snapshot();
        expect(snap.toolCalls).toEqual({ addNumbers: 2, sendEmail: 1 });
    });

    test('llm tokens 累加', () => {
        const m = createMetricsExporter();
        m.incrLLMTokens('gpt-4', 'prompt', 100);
        m.incrLLMTokens('gpt-4', 'prompt', 50);
        m.incrLLMTokens('gpt-4', 'completion', 20);
        const snap = m.snapshot();
        expect(snap.llmTokens['gpt-4|prompt']).toBe(150);
        expect(snap.llmTokens['gpt-4|completion']).toBe(20);
    });

    test('histogram bucket 与 sum/count', () => {
        const m = createMetricsExporter();
        m.recordWorkflowDuration('wf', 'SUCCESS', 80);
        m.recordWorkflowDuration('wf', 'SUCCESS', 200);
        m.recordWorkflowDuration('wf', 'SUCCESS', 1500);
        const out = m.render();
        expect(out).toContain('workflow_duration_ms_count{workflow="wf",status="SUCCESS"} 3');
        expect(out).toContain('workflow_duration_ms_sum{workflow="wf",status="SUCCESS"} 1780');
        // 80 + 200 + 1500 落 +Inf 桶 = 3
        expect(out).toContain('workflow_duration_ms_bucket{workflow="wf",status="SUCCESS",le="+Inf"} 3');
    });

    test('render Prometheus 格式头', () => {
        const m = createMetricsExporter();
        m.incrToolCall('t');
        const out = m.render();
        expect(out).toContain('# TYPE tool_call_total counter');
        expect(out).toContain('# TYPE workflow_duration_ms histogram');
        expect(out).toMatch(/\n$/);
    });

    test('label 转义引号与反斜杠', () => {
        const m = createMetricsExporter();
        m.incrNodeExecution('tool', 'SUCCESS');
        const out = m.render();
        expect(out).toContain('nodes_execution_total{type="tool",status="SUCCESS"} 1');
    });
});
