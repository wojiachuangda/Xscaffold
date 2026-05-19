// [test] ID: PAM-7 | Date: 2026-05-19 | Description: digestBuilder 纯函数单元测试（range 窗口 + 装配 + markdown 渲染）
'use strict';

const {
    assembleDigest,
    renderMarkdown,
    rangeSinceIso,
    reminderBeforeIso,
    RECENT_EVENTS_CAP,
} = require('../../src/domain/projectAssistant/digestBuilder');

const FIXED_NOW = new Date('2026-05-19T12:00:00.000Z');

const PROJECT = {
    projectId: 'p',
    name: 'P',
    phase: 'A.1',
    status: 'active',
    health: 'green',
    completion: 70,
    summary: 'all green',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
};

describe('digestBuilder pure functions (PAM-7)', () => {
    test('rangeSinceIso daily → 过去 24 小时', () => {
        expect(rangeSinceIso('daily', FIXED_NOW)).toBe('2026-05-18T12:00:00.000Z');
    });

    test('rangeSinceIso weekly → 过去 7 天', () => {
        expect(rangeSinceIso('weekly', FIXED_NOW)).toBe('2026-05-12T12:00:00.000Z');
    });

    test('rangeSinceIso all → null', () => {
        expect(rangeSinceIso('all', FIXED_NOW)).toBeNull();
    });

    test('reminderBeforeIso → 当前 + 未来 24 小时', () => {
        expect(reminderBeforeIso(FIXED_NOW)).toBe('2026-05-20T12:00:00.000Z');
    });

    test('assembleDigest 计算 tasks 总数与未完成数', () => {
        const tasks = [
            { taskId: 'a', status: 'open', priority: 'high', title: 'A' },
            { taskId: 'b', status: 'in_progress', priority: 'normal', title: 'B' },
            { taskId: 'c', status: 'done', priority: 'low', title: 'C' },
        ];
        const d = assembleDigest({
            project: PROJECT,
            tasks,
            events: [],
            reminders: [],
            range: 'daily',
            now: FIXED_NOW,
        });
        expect(d.tasks.total).toBe(3);
        expect(d.tasks.open).toBe(2);
        expect(d.generatedAt).toBe('2026-05-19T12:00:00.000Z');
    });

    test('assembleDigest recentEvents 截断到 RECENT_EVENTS_CAP', () => {
        const events = Array.from({ length: 15 }, (_, i) => ({
            eventId: `e${i}`,
            type: 'note',
            title: `t${i}`,
            severity: 'normal',
        }));
        const d = assembleDigest({
            project: PROJECT,
            tasks: [],
            events,
            reminders: [],
            range: 'all',
            now: FIXED_NOW,
        });
        expect(d.recentEvents).toHaveLength(RECENT_EVENTS_CAP);
    });

    test('renderMarkdown 包含项目/任务/事件/提醒各 section 标题', () => {
        const md = renderMarkdown({
            project: PROJECT,
            tasks: { total: 1, open: 1, items: [{ status: 'open', title: 'demo', priority: 'high' }] },
            recentEvents: [{ severity: 'high', type: 'ci_passed', title: 'CI 全绿' }],
            dueReminders: [{ dueAt: '2026-05-20T00:00:00.000Z', title: 'check' }],
            range: 'daily',
            generatedAt: FIXED_NOW.toISOString(),
        });
        expect(md).toContain('# 项目摘要：P');
        expect(md).toContain('## 任务');
        expect(md).toContain('共 1 项，未完成 1 项');
        expect(md).toContain('## 最近事件');
        expect(md).toContain('ci_passed: CI 全绿');
        expect(md).toContain('## 24 小时内到期提醒');
        expect(md).toContain('check');
    });

    test('renderMarkdown 空集合时显示占位', () => {
        const md = renderMarkdown({
            project: { ...PROJECT, summary: '' },
            tasks: { total: 0, open: 0, items: [] },
            recentEvents: [],
            dueReminders: [],
            range: 'all',
            generatedAt: FIXED_NOW.toISOString(),
        });
        expect(md).toContain('_无任务_');
        expect(md).toContain('_无事件_');
        expect(md).toContain('_无到期提醒_');
        expect(md).toContain('_无_'); // 空 summary
    });
});
