-- [planner] ID: V1.5-A.2 | Date: 2026-05-19 | Description: IOOR & audit_dead_letters PG 方言（JSONB + AA-SEAC §4.3 GIN 倒排索引；与 sqlite/005 行为等价）
CREATE TABLE IF NOT EXISTS ioor_records (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    agent_id TEXT,
    profile_hash TEXT,
    model_provider TEXT,
    model_name TEXT,
    input JSONB,
    output JSONB,
    tool_calls JSONB,
    observations JSONB,
    token_usage JSONB,
    latency_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT xs_iso_now()
);

CREATE INDEX IF NOT EXISTS idx_ioor_execution ON ioor_records(execution_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_ioor_profile ON ioor_records(profile_hash);

-- AA-SEAC §4.3 要求 IOOR JSONB 关键检索键建 GIN 倒排索引
CREATE INDEX IF NOT EXISTS idx_ioor_input_gin ON ioor_records USING GIN (input);
CREATE INDEX IF NOT EXISTS idx_ioor_output_gin ON ioor_records USING GIN (output);
CREATE INDEX IF NOT EXISTS idx_ioor_tool_calls_gin ON ioor_records USING GIN (tool_calls);
CREATE INDEX IF NOT EXISTS idx_ioor_observations_gin ON ioor_records USING GIN (observations);

-- 审计降级通道：契约校验失败但原始数据需保留时使用
CREATE TABLE IF NOT EXISTS audit_dead_letters (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    reason TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TEXT NOT NULL DEFAULT xs_iso_now()
);

CREATE INDEX IF NOT EXISTS idx_audit_source ON audit_dead_letters(source, created_at);
