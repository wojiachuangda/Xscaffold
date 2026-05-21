-- [planner] ID: V2.6-LONG-SESSION | Date: 2026-05-22 | Description: messages 加多租户 owner_id PG 方言（与 sqlite/010 等价）；现有行 backfill 给 dev 默认用户
ALTER TABLE messages ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'user_dev_default';

CREATE INDEX IF NOT EXISTS idx_messages_session_owner ON messages(session_id, owner_id, created_at);
