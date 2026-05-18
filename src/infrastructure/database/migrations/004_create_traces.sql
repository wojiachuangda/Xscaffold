-- [scaffold] ID: T5.4 | Date: 2026-05-18 | Description: node_traces 表（工作流节点级 trace）
CREATE TABLE IF NOT EXISTS node_traces (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','FAILED','STUCK','TIMEOUT')),
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER,
    attempt INTEGER NOT NULL DEFAULT 1,
    output TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_traces_execution ON node_traces(execution_id, started_at);
CREATE INDEX IF NOT EXISTS idx_traces_status ON node_traces(status);
