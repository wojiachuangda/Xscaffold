// [ui] ID: WEBUI-V2.3-PROJECTS | Date: 2026-05-21 | Description: Projects 视图数据层——封装 /projects 9 端点的读写调用（envelope 解包）
'use strict';

import { api } from '../../lib/api.js';

const PAGE = 50;
// reminders 端点是 reminderListDue 语义（before 截止）；视图要展示全部即将到期的提醒，
// 传一个远期 before（now + 1 年），避免被服务端默认的 now+7d 窗口过滤掉。
const REMINDER_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

const pid = (id) => encodeURIComponent(id);

export async function fetchProjects() {
    const payload = await api(`/projects?limit=${PAGE}&offset=0`);
    return { items: payload.data || [], total: payload.meta?.total ?? 0 };
}

export async function fetchTasks(id) {
    const payload = await api(`/projects/${pid(id)}/tasks?limit=${PAGE}&offset=0`);
    return payload.data || [];
}

export async function fetchReminders(id) {
    const before = new Date(Date.now() + REMINDER_WINDOW_MS).toISOString();
    const payload = await api(`/projects/${pid(id)}/reminders?before=${encodeURIComponent(before)}&limit=${PAGE}&offset=0`);
    return payload.data || [];
}

export async function fetchEvents(id) {
    const payload = await api(`/projects/${pid(id)}/events?limit=${PAGE}&offset=0`);
    return payload.data || [];
}

export async function upsertTask(id, body) {
    return (await api(`/projects/${pid(id)}/tasks`, { method: 'POST', body })).data;
}

export async function createReminder(id, body) {
    return (await api(`/projects/${pid(id)}/reminders`, { method: 'POST', body })).data;
}

export async function recordEvent(id, body) {
    return (await api(`/projects/${pid(id)}/events`, { method: 'POST', body })).data;
}

export async function updateProjectStatus(id, body) {
    return (await api(`/projects/${pid(id)}`, { method: 'PUT', body })).data;
}
