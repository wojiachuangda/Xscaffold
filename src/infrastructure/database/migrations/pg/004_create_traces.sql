-- [planner] ID: V1.5-A.2 | Date: 2026-05-19 | Description: node_traces 表 PG 方言（output/error 改 JSONB；与 sqlite/004 行为等价）
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
    output JSONB,
    error JSONB
);

CREATE INDEX IF NOT EXISTS idx_traces_execution ON node_traces(execution_id, started_at);
CREATE INDEX IF NOT EXISTS idx_traces_status ON node_traces(status);
