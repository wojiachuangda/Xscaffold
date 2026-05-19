-- [planner] ID: PAM-1 | Date: 2026-05-19 | Description: external_agent_calls 审计日志表（不暴露独立列表 Tool；仅 digest 内部读取）

CREATE TABLE IF NOT EXISTS external_agent_calls (
    call_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    profile TEXT NOT NULL,
    session_id TEXT NOT NULL,
    instruction TEXT NOT NULL,
    expectation TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'timeout')),
    reply TEXT,
    summary TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_eac_project ON external_agent_calls(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eac_status ON external_agent_calls(status);
CREATE INDEX IF NOT EXISTS idx_eac_session ON external_agent_calls(session_id);
