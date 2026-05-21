-- [planner] ID: V2.5-MT | Date: 2026-05-21 | Description: agents 加多租户 owner_id + 运行参数 PG 方言（与 sqlite/009 等价）；现有行 backfill 给 dev 默认用户
ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'user_dev_default';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION NOT NULL DEFAULT 0.7;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS max_turns INTEGER NOT NULL DEFAULT 8;

CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_id);
