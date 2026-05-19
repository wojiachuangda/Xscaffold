-- [planner] ID: V1.5-A.2 | Date: 2026-05-19 | Description: PG 方言辅助函数：xs_iso_now() 与 SQLite strftime('%Y-%m-%dT%H:%M:%fZ','now') 输出格式严格等价
CREATE OR REPLACE FUNCTION xs_iso_now() RETURNS text AS $$
    SELECT to_char((now() AT TIME ZONE 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$ LANGUAGE SQL STABLE;
