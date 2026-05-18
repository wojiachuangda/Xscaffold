-- [scaffold] ID: T4.3 | Date: 2026-05-18 | Description: executions 表（工作流执行记录持久化）
CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCESS','FAILED','STUCK','TIMEOUT')),
    input TEXT,
    result TEXT,
    error TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at);
