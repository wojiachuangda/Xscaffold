-- [planner] ID: V2.5-MT | Date: 2026-05-21 | Description: agents 加多租户 owner_id + 运行参数（system_prompt/temperature/max_turns）；现有行 backfill 给 dev 默认用户
ALTER TABLE agents ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'user_dev_default';
ALTER TABLE agents ADD COLUMN system_prompt TEXT;
ALTER TABLE agents ADD COLUMN temperature REAL NOT NULL DEFAULT 0.7;
ALTER TABLE agents ADD COLUMN max_turns INTEGER NOT NULL DEFAULT 8;

CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);
