-- [scaffold] ID: T5.3 | Date: 2026-05-18 | Description: IOOR 与审计降级表（AA-SEAC §4.3 混合存储）
CREATE TABLE IF NOT EXISTS ioor_records (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    agent_id TEXT,
    profile_hash TEXT,
    model_provider TEXT,
    model_name TEXT,
    input TEXT,
    output TEXT,
    tool_calls TEXT,
    observations TEXT,
    token_usage TEXT,
    latency_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ioor_execution ON ioor_records(execution_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_ioor_profile ON ioor_records(profile_hash);

-- 审计降级通道：契约校验失败但原始数据需保留时使用
CREATE TABLE IF NOT EXISTS audit_dead_letters (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    reason TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_source ON audit_dead_letters(source, created_at);
