-- [planner] ID: V1.5-A.2 | Date: 2026-05-19 | Description: external_agent_calls 审计日志 PG 方言（全部标量；与 sqlite/007 行为等价）

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
    created_at TEXT NOT NULL DEFAULT xs_iso_now()
);

CREATE INDEX IF NOT EXISTS idx_eac_project ON external_agent_calls(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eac_status ON external_agent_calls(status);
CREATE INDEX IF NOT EXISTS idx_eac_session ON external_agent_calls(session_id);
