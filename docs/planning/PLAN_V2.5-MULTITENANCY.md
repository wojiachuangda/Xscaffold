# PLAN — 多租户：User + API Key + Agent 归属隔离 + Agent 实体扩展

> 阶段：PLAN（等 CONFIRM → SPEC → CODE）
> ⚠️ **方向转变**：从「个人单用户、不考虑风控」转为**多租户 + 按用户隔离**。此后 agent 的 owner 边界
> 是真实安全边界（跨用户访问必须 404），与之前「单用户豁免授权」的裁定相反——用户本次明确要做。

---

## 1. 现状

- Agent 实体（`agentSchema.js`，camelCase）：id/name/description/model/tools/status/createdAt/updatedAt。
  `agents` 表 `name TEXT NOT NULL UNIQUE`（**全局唯一**）。
- `agentRunner`：max_turns 走 `DEFAULT_MAX_ITERATIONS`(env/8)；system prompt 在 `systemMessage()` 硬编码
  （name+description 拼模板）；**temperature 没传给 llmClient**。三者均可干净抽出用 agent 字段。
- 认证：`authMiddleware`（JWT）设 `req.user = jwt.verify(...)`；`AUTH_DISABLED`(dev) 直接 next()、**不设 req.user**。
  全局 `app.use(authMiddleware)` 在 mountProtectedRoutes。
- DB：sqlite/pg 双驱动，迁移成对（migrations/sqlite/ + pg/，现 001-007）。

---

## 2. 设计

### 2.1 Agent 实体扩展（SPEC）
`AgentSchema` 加：`ownerId`(string)、`systemPrompt`(string,nullable)、`temperature`(number 0-2,default 0.7)、
`maxTurns`(int 1-50,default 8)。DB 列：owner_id/system_prompt/temperature/max_turns（snake_case，repo 映射）。

### 2.2 agentRunner 抽出（CODE，不改循环核心）
- `systemMessage(agent)`：`agent.systemPrompt` 有则用，否则回退现有生成模板。
- `chat({...})`：加 `temperature: agent.temperature ?? 0.7`。
- maxIterations：`maxIterations ?? agent.maxTurns ?? DEFAULT_MAX_ITERATIONS`。

### 2.3 User + ApiKey（SPEC + 迁移 + repo）
- `users` 表：id / name / email(unique) / status / created_at。
- `api_keys` 表：id / user_id / key_hash / name(标签) / status / created_at（**只存哈希**）。
- `UserSchema` / `ApiKeySchema`（Zod）；`userRepository` / `apiKeyRepository`（SQL 仅在 repo，AA-SEAC 约束4）。
- key 生成：`sk_` + 高熵随机；返回明文一次（创建时），库里存哈希（见 D3）。

### 2.4 apiKeyMiddleware（CODE）
从 Header 解析 key → 哈希 → `apiKeyRepository.findByHash` → 查 user → `req.user = { id: user_id, ... }`。
与现有 auth 的关系见 **D1**。dev 无 key 见 **D4**。

### 2.5 agentController scope（CODE，不改 invoke）
- POST `/agents`：`owner_id = req.user.id` 自动写入。
- GET `/agents`：repo 按 owner_id 过滤。
- GET/PUT/DELETE `/:id`：先查 → owner 不符 **404**（不泄漏存在性）。
- service/repository 加 owner 维度（`listAgents(owner, filter)` / `getByIdForOwner(owner, id)`）。

### 2.6 不动
invoke 循环、工具白名单、SSE、工作流引擎、IOOR、安全管线、其它视图——全不动。

---

## 3. 修改范围（按阶段）

| 阶段 | 文件 |
|---|---|
| SPEC | `agentSchema.js`(+4字段)、新 `userSchema.js`、新 `apiKeySchema.js` |
| 迁移 | `migrations/{sqlite,pg}/008_alter_agents_owner.sql`（加列 + name 唯一改 per-owner）、`009_create_users_apikeys.sql` |
| repo | 新 `userRepository.js`、`apiKeyRepository.js`；改 `agentRepository.js`（读写新列 + owner 过滤/校验） |
| 中间件 | 新 `apiKeyMiddleware.js` + key 哈希/生成 util；`server.js` 接线 |
| controller | `agentController.js`（scope）+ `agentService.js`（owner 维度） |
| runner | `agentRunner.js`（systemPrompt/temperature/maxTurns 抽出） |
| 用户管理 | （可选）`/users`、`/apikeys` 端点用于建用户/发 key（见 D7）；否则用 seed 脚本 |
| seed | dev 默认用户 + 一个 api key（供 dev/WEBUI） |
| 测试 | apiKey 中间件单测、agent owner 隔离 e2e、agentRunner 新字段单测 |

---

## 4. 风险评估

- **架构转变**：单用户→多租户，agent owner 是真实安全边界。跨用户隔离必须有测试覆盖。
- **`agents.name` 全局唯一 → per-owner 唯一**：sqlite 改约束需重建表（copy → drop → rename）或加 owner_id + 新唯一索引 `(owner_id,name)` 并去掉旧全局唯一。pg 同步。**已 seed 的 agent 需 backfill owner_id**（见 D6），否则 scope 查询查不到。
- **认证交织**：现有 JWT + AUTH_DISABLED 与新 API key 共存（D1）。dev 无 key 时 req.user 缺失会让 scope 崩（D4）。
- **WEBUI 影响**：WEBUI 调 /agents，多租户后需带 key。dev 用默认用户可暂不改前端（D8）。
- **测试影响**：现有 agent 测试可能不带 owner/key → 需更新（注入测试 user 或 AUTH_DISABLED dev-user）。务必保 562+ 不破或同步改测试。
- 迁移在本地 sqlite 验；pg 真路径走 CI（沿用既有范式）。

---

## 5. 待 CONFIRM 的决策点

| # | 决策 | 我的建议 |
|---|------|---------|
| D1 | API key 与现有 JWT/AUTH_DISABLED 关系 | **apiKeyMiddleware 作为 req.user 的解析层**，挂在 protected 链；有 key→查用户，无 key 且 AUTH_DISABLED→注入 dev 默认用户，无 key 且非 dev→401。保留 JWT authMiddleware 作为可选并存（本轮 agent 走 key 为主）。不强求一步替换 JWT |
| D2 | key 传递 Header | **`X-API-Key: <key>`**（专用头，不和 JWT 的 Authorization Bearer 混） |
| D3 | key 哈希 | **SHA-256**（key 是高熵随机，等价 token；bcrypt 是给低熵密码的，没必要）。`timingSafe` 比对兜底 |
| D4 | dev 无 key 怎么办 | **AUTH_DISABLED 时注入 seed 的 dev 默认用户**（dev 零摩擦，WEBUI 不用改）。生产必须带 key |
| D5 | agents.name 唯一性 | 改 **per-owner 唯一 `(owner_id, name)`**（不同用户可同名 agent） |
| D6 | 已有 seed agent 怎么办 | 迁移里 **backfill owner_id = dev 默认用户**（否则 dev 看不到现有 4 个 agent） |
| D7 | 建用户/发 key 的入口 | 本轮先 **seed 脚本**建 dev user + key；`/users`、`/apikeys` 管理端点留下一轮（避免本轮过大） |
| D8 | WEBUI 是否本轮改 | **本轮不改 WEBUI**（dev 走默认用户）；真多租户时给 WEBUI settings 加 API key 字段 = 下一轮 |

---

## 6. 执行顺序（CONFIRM 后；分阶段 commit）

1. **SPEC**：agentSchema +4 字段 + userSchema + apiKeySchema → jest
2. 迁移 008/009（sqlite+pg）+ migrate 本地验（表/列/索引、backfill）
3. userRepository / apiKeyRepository + key 哈希·生成 util + 单测
4. agentRepository owner 维度（读写新列、按 owner 过滤/校验）
5. apiKeyMiddleware + server.js 接线 + dev 默认用户注入
6. agentController scope（create owner / list / get-put-delete 404）+ agentService
7. agentRunner 抽 systemPrompt/temperature/maxTurns
8. seed 脚本（dev user + key）+ 跨用户隔离 e2e + 全量 jest + eslint
9. 各阶段验证过自动 commit + push
```
（用户管理端点 /users /apikeys + WEBUI key 字段 = 下一轮，本 PLAN 不含）
```
