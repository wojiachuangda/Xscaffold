-- [planner] ID: V2.5-MT | Date: 2026-05-21 | Description: 多租户身份 PG 方言——users + api_keys 表 + dev 默认用户（与 sqlite/008 等价）
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL DEFAULT xs_iso_now()
);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at TEXT NOT NULL DEFAULT xs_iso_now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

INSERT INTO users (id, name, email, status)
VALUES ('user_dev_default', 'Dev', 'dev@local', 'active')
ON CONFLICT (id) DO NOTHING;
