# PLAN — V2.2 SSE WEBUI 接入（Sessions 视图）

> 阶段：PLAN（待 CONFIRM）
> 来由：V2.2 后端 SSE 端点已落地（commit `23105ac`，`POST /agents/:id/invoke/stream`）。
> 前 PLAN_V2.2-SSE-REDACT 决策 D5「WEBUI 接入后端先行」—— 现在补 WEBUI。

## 1. 现状

`WEBUI/views/sessions.js sendPrompt`：同步调 `api('/agents/:id/invoke', POST)`
等完整 JSON 返回 → 构造 cell → `appendCell` 写 localStorage → `renderSessions()`
全量重画。用户体验：点 Send 后界面静止数秒到数十秒，最后整条 cell 一次性出现。

## 2. 方案

切到流式调用：`fetch('/api/agents/:id/invoke/stream')` 拿 ReadableStream →
解析 SSE 帧 → 每个 `turn` 事件**增量插入**当前 live cell（不动 prompt 输入区）→
`done` 事件 finalize + 一次性写 localStorage。

### 关键机制
- **增量 DOM 更新**，不走 `renderSessions()` 全量重画 —— 全量重画会清掉用户正在打的下一条 prompt
- **fetch + ReadableStream**（非 `EventSource`），因为需要 POST + `Authorization` 头
- **SSE 解析**：UTF-8 decoder + buffer + 按 `\n\n` 切帧；`: ping` 心跳帧跳过；`data:` 行 JSON.parse
- **localStorage 仅 `done` 时写一次**（in-flight 崩溃丢这条 cell 可接受，sessions 是 dev 工具）
- **后台完成**：用户切走 view / 切别的 session → 不 abort fetch，让 invoke 跑完写回原 session 的 localStorage；DOM 写入前判断 currentSessionId 是否仍是 streamedSessionId

### 抽象
新增 `WEBUI/lib/sseClient.js` —— 抽出 `streamSse(url, body, handlers)` 通用 helper：处理头、ReadableStream、UTF-8、缓冲、帧切分、handlers `{onStart, onTurn, onDone, onError}`。保 `sessions.js` 不臃肿。

## 3. 修改范围

- 改 `WEBUI/views/sessions.js`：`sendPrompt` 改流式；新增 in-memory pending cell 状态 + 增量 DOM helpers（appendTurnRow / finalizeLiveCell / markCellError）
- 新 `WEBUI/lib/sseClient.js`：通用 SSE 读取/解析（~80 行）
- 不动：后端 / 路由 / 其他 view / 其他 lib / DB / Zod

预估 diff：~150 行（sessions.js +50，sseClient.js +80，外加注释）。
不引依赖（原生 `fetch` + `ReadableStream` + `TextDecoder`）。
命中 RULES 大改动条件 10（改变现有 Send 行为）→ 走 PLAN→CONFIRM。

## 4. 风险

| 项 | 影响 | 缓解 |
|---|---|---|
| chunk 在帧中间断开 | 解析错乱 | buffer + 等 `\n\n` 再切帧 |
| 心跳 `: ping` 误解析 | parser 崩 | 跳过 `:` 开头的行 |
| 用户切走中途 | DOM 更新到不存在的容器 | DOM 写入前 `document.getElementById('se-cells')` 存在校验 + currentSessionId 比对 |
| HTTP 非 2xx（agent 404） | 不是 SSE 流而是 JSON 错误 | 检查 `response.headers['content-type']`；非 `text/event-stream` 走 JSON 错误路径 |
| fetch 网络错误 | catch 写 error cell | try/catch 包整段；error cell 直接 finalize |
| 旧 cell（同步路径生成）混在历史里 | 兼容性 | 不动现有 localStorage 数据；新流式生成的 cell 数据结构与旧 cell 完全一致（同 schema） |

## 5. 验收（手动浏览器）
1. agents 已就绪 + 后端起 → 进 Sessions → 新建 session 选 agent
2. Send 一条 prompt → **看到 turn 一行一行追加**（不是等几秒后一次性出现）
3. done 后 cell 完整、meta 显示 token/turns/stopReason
4. 中途切到 runtime → 等 done → 切回 sessions 同 session → cell 已在 localStorage、刷新可见
5. 用 stub provider 测 error 路径（kill 后端 / 切错 LLM key）→ cell 内 error block 显示
6. 用一个带 `apiKey: "sk-LEAK"` arguments 的 prompt（手工触发 LLM 调工具时带敏感 args）→ live cell 显示 `[REDACTED]`、不含原值（验后端脱敏在前端可见）
7. 浏览器 console 无报错；非流式旧 cell 历史仍可读

## 6. 待 CONFIRM 决策点

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D1 | 渲染粒度 | A 每事件全量 `renderSessions()` / B DOM 增量插入 `#se-cells` | **B 增量** —— 全量重画会冲掉 prompt 输入区 |
| D2 | localStorage 写入时机 | A 每 turn 写 / B 仅 `done` 写 | **B 仅 done 写** —— 简单；in-flight 崩溃丢这条 cell 可接受 |
| D3 | 用户切走中途 | A abort fetch / B 后台完成回写原 session | **B 后台完成** —— 与后端「断连仍 IOOR 留痕」呼应 |
| D4 | live cell 视觉标记 | A 与历史 cell 同样 / B 加 `is-live` 蓝色左 border 区分 | **B** —— 让用户知道这条仍在流式中 |
| D5 | 中断 Send 按钮 | 加 / 不加 | **不加** —— MVP；后端 8 轮 max_iterations 自然封顶 |

附加：Q1 验证方式 —— 手动浏览器（WEBUI 一贯无自动化测试）。

---

全接受回 `CONFIRM` 进 CODE（无 Zod 契约变更，SPEC 跳过）。要改某项直接说。
