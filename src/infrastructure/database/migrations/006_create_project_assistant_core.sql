-- [planner] ID: PAM-1 | Date: 2026-05-19 | Description: 项目助理 MVP 核心表（projects/pa_tasks/pa_events/pa_reminders）

CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done', 'blocked')),
    health TEXT NOT NULL DEFAULT 'green' CHECK (health IN ('green', 'yellow', 'red')),
    completion INTEGER NOT NULL DEFAULT 0 CHECK (completion BETWEEN 0 AND 100),
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- pa_ 前缀避免与未来通用 tasks/events/reminders 表名冲突
CREATE TABLE IF NOT EXISTS pa_tasks (
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'skipped')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (project_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_pa_tasks_status ON pa_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pa_tasks_priority ON pa_tasks(project_id, priority);
CREATE INDEX IF NOT EXISTS idx_pa_tasks_updated ON pa_tasks(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS pa_events (
    event_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high', 'critical')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pa_events_project ON pa_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pa_events_severity ON pa_events(project_id, severity);
CREATE INDEX IF NOT EXISTS idx_pa_events_type ON pa_events(project_id, type);

CREATE TABLE IF NOT EXISTS pa_reminders (
    reminder_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    due_at TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pa_reminders_due ON pa_reminders(status, due_at);
CREATE INDEX IF NOT EXISTS idx_pa_reminders_project ON pa_reminders(project_id, status);
