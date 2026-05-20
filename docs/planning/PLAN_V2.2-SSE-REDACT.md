# PLAN — V2.2 SSE 流式 + 传输脱敏

> 阶段：PLAN（待 CONFIRM）
> 来由：架构文档 §4.5「双重脱敏」第 2 条（传输流式脱敏）+ §7.1（长任务 SSE
> 推中间状态）+ §8 V2「流式 SSE」—— 历史欠账，SECURITY_AUDIT §9 标为
> ⚠️ INFO 未实现。本 PLAN 收口它。

## 1. 现状

- **脱敏函数已就绪**：`src/observability/redact.js` `redactSensitive(obj)`
  深度按 key 名脱敏，文件头注释本就写明「用于 SSE 流式输出 / IOOR 落库前的
  二次保险」。缺的是「用它的 SSE 通道」。
- **agentic loop 有清晰 turn 边界**：`agentRunner.js runAgentLoop` 同步
  `for` 循环，每轮 LLM → tool → observation 完成即一个 turn，结束返回
  `{content, turns, tokenUsage, stopReason}`。
- **LLM client 不支持流式**：`openaiClient.chat` 单次 POST 取完整 JSON，
  无 `stream:true`。→ token 级流式需重写 client（含 tool_call delta 拼装，
  公认易错）。**MVP 做 turn 级流式**。
- 现有 `POST /agents/:id/invoke` 同步返回；562 测试依赖其行为不变。

## 2. 方案

### 2.1 turn 级流式（非 token 级）
新增 `POST /agents/:id/invoke/stream`，SSE 响应。`runAgentLoop` 加一个
**可选 `onEvent` 回调**：每完成一个 turn 触发；不传 `onEvent` 时全程 no-op
→ 现有同步 `/invoke` 与 562 测试**零行为变化**。

事件序列：`start`（agentId/model）→ `turn` × N（turnIndex/content/
toolCalls/observations）→ `done`（content/tokenUsage/stopReason）；
异常 → `error` 事件后关闭。

### 2.2 传输脱敏拦截层（AA-SEAC §4.5 红线）
新增 `src/apiGateway/sse.js` —— **唯一的 SSE 出口** `writeEvent(res, event)`：
event → 脱敏不可信子载荷 → 格式化 SSE 帧 → `res.write()`。controller 不直接
`res.write`，只能经 `writeEvent`，保证每一字节 SSE 流量都过脱敏拦截。

**脱敏范围（SPEC 阶段修正）**：不能对整个 event 无脑跑 `redactSensitive`——
它按 key 名匹配，敏感词 `token` 会误伤 envelope 自身的 `tokenUsage` /
`cached_prompt_tokens`（含子串 `token`），把合法字段清成 `[REDACTED]`。
故只对**承载外部数据的子载荷**深度脱敏：
- `turn.toolCalls[].arguments` —— LLM 生成的工具入参
- `turn.observations[].data` —— 工具返回结果

envelope 元数据（type / turnIndex / tokenUsage / stopReason / model 等是
本系统自有数据、非密钥载体）保持原样。LLM 自由文本 `content` 不做内容
启发式扫描——延续既有项目策略（与 IOOR / 日志脱敏一致）。

### 2.3 SSE 通道附属机制
- **心跳**：每 15s 发 `: ping` 注释帧，防代理掐断空闲连接
- **客户端断开**：`req.on('close')` → 停止写死 socket；但 **loop 跑完 +
  IOOR 照常落库**（凡动必留痕优先于省算力）
- **错误**：SSE 头已 200 发出后无法改状态码，全局 errorHandler 不适用 →
  controller 自行 catch 并发 `error` 事件。**SSE 端点显式豁免统一 JSON
  响应契约**（AA-SEAC 约束 1）——流式通道天然不同，错误降级为 `error` 事件
- **鉴权**：走同 router，继承 `authMiddleware` JWT；客户端用 `fetch`+
  ReadableStream（非 `EventSource`，故可带 `Authorization` 头）

## 3. SPEC 阶段产出（CONFIRM 后、CODE 前）
AA-SEAC §4.1「代码即契约」：SSE 事件是对外数据流，须 Zod 定义。
- `SseEventSchema` —— `type: start|turn|done|error` discriminated union
- 位置 SPEC 时定（拟 `src/apiGateway/response/sseEventSchema.js`，与
  `envelope.js` 同级）

## 4. 修改范围

新增：
- `src/apiGateway/sse.js` —— 脱敏 SSE writer + 心跳 + 连接生命周期（~80 行）
- `src/apiGateway/response/sseEventSchema.js` —— SSE 事件 Zod 契约（SPEC 产出）
- `tests/integration/agentInvokeStream.*.test.js` —— SSE 端点测试

改动：
- `src/agentManager/agentRunner.js` —— `runAgentLoop` 加可选 `onEvent` hook（~10 行，默认 no-op）
- `src/agentManager/agentController.js` —— 加 `POST /:id/invoke/stream` 路由（~35 行）

不动：
- `redact.js`（直接复用）、`openaiClient.js`（turn 级不需 LLM 流式）
- 现有 `POST /agents/:id/invoke`（同步端点保留，零改动）
- DB / 迁移 / 队列 / 其它 controller

命中 RULES 大改动条件 2（新增 REST 端点）/ 3（新增 Zod Schema）/ 8（影响
脱敏·安全审计）→ 完整 PLAN→CONFIRM→SPEC→CODE。

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 脱敏被绕过 | `writeEvent` 设为唯一出口；controller 不碰 `res.write`；测试注入 secret 断言 `[REDACTED]` |
| 流式中途出错无法改 HTTP 码 | controller 自 catch → `error` 事件 → 关闭；文档标注 SSE 豁免 JSON 契约 |
| 长 invoke 连接被代理掐 | 15s 心跳注释帧 |
| 客户端断开后 loop 空跑 | 接受——loop 跑完保证 IOOR 留痕；仅停止写 socket |
| 现有同步 `/invoke` / 562 测试回归 | `onEvent` 可选 + 默认 no-op；新端点完全独立，旧端点一行不改 |
| LLM 自由文本含密钥 | 已知局限——按 key 名脱敏不扫文本，与 IOOR/日志同策略；PLAN 显式声明 |

## 6. 验收
1. `curl -N POST /agents/:id/invoke/stream`（stub provider）→ 收到
   `start` → `turn` → `done` 事件序列，帧格式合规
2. 注入带 `password`/`apiKey` 键的 tool observation → SSE 流里对应值是
   `[REDACTED]`，原始值不外泄
3. 中途 `kill` 客户端连接 → 服务端不崩、IOOR 该 invoke 记录完整
4. agent 不存在 / loop 抛错 → 收到 `error` 事件而非挂起
5. 现有 `POST /agents/:id/invoke` 同步行为不变；全量 jest 不回归
6. `npm run lint` 0 error

## 7. 待 CONFIRM 决策点

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D1 | 流式粒度 | turn 级 / token 级 | **turn 级** —— token 级要重写 openaiClient 流式 + tool_call delta 拼装，易错且超 MVP；turn 级已交付「中间状态可见」价值 |
| D2 | 端点形态 | 新端点 `/invoke/stream` / 改造 `/invoke` 内容协商 | **新端点** —— 旧端点 + 562 测试零风险 |
| D3 | 流式对象 | 仅 agent invoke / 也含 workflow 执行 | **仅 agent invoke** —— workflow 是队列解耦的后台任务，流式需 pub/sub，工程量大；留 V2 |
| D4 | 客户端断开 | 中断 loop / loop 跑完只停写 | **跑完只停写** —— 保 IOOR 留痕完整 |
| D5 | WEBUI 接入 | 本期一起做 Sessions 消费流式 / 后端先行 | **后端先行** —— 本 PLAN 只交付后端 SSE + 脱敏 + 测试；WEBUI Sessions 视图接流式作紧接的下一个小 PLAN（避免一锅端） |

附加：Q1 心跳间隔 15s（建议）；Q2 SECURITY_AUDIT §4.5/§9 同步更新「SSE 流式脱敏 ✅」、架构文档偏差注记（建议：是）。

---

全接受回 `CONFIRM`，进 SPEC（写 `SseEventSchema`）→ CODE。要改某项直接说。
