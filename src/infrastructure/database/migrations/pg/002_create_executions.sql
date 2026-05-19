-- [planner] ID: V1.5-A.2 | Date: 2026-05-19 | Description: executions 表 PG 方言（input/result/error 改 JSONB；与 sqlite/002 行为等价）
CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCESS','FAILED','STUCK','TIMEOUT')),
    input JSONB,
    result JSONB,
    error JSONB,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at);
