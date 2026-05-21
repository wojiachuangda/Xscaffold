-- [planner] ID: V2.6-LONG-SESSION | Date: 2026-05-22 | Description: messages 加多租户 owner_id（长会话归属隔离）；现有行 backfill 给 dev 默认用户
ALTER TABLE messages ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'user_dev_default';

CREATE INDEX IF NOT EXISTS idx_messages_session_owner ON messages(session_id, owner_id, created_at);
