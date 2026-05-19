-- [planner] ID: V1.5-A.2 | Date: 2026-05-19 | Description: agents 表 PG 方言（tools 改 JSONB；时间戳 TEXT + xs_iso_now() 默认；与 sqlite/001 行为等价）
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    model TEXT NOT NULL,
    tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
    created_at TEXT NOT NULL DEFAULT xs_iso_now(),
    updated_at TEXT NOT NULL DEFAULT xs_iso_now()
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
