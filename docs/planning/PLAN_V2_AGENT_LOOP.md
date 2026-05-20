// [planner] ID: PLAN-V2-AGENT-LOOP | Date: 2026-05-20 | Description: Agent OpenAI tool-calling agentic loop + POST /agents/:id/invoke + WEBUI Talk box；用户已 CONFIRM

# V2-AGENT-LOOP — Agent 真实 LLM 接入 + 工具调用循环

> 触发：用户要求把 agent 从 stub 切到真实 LLM，让绑定的 tool 能被 agent 自主调用
> 决策（用户 CONFIRM）：OpenAI-compatible / 完整 tool calling loop / agents 详情 Talk 框 / 引 zod-to-json-schema / 拆 7a 后端 + 7b 前端

---

## 1. 拆分

| 阶段 | 范围 | 状态 |
|---|---|---|
| **commit 7a** | agentic loop 后端 + invoke 端点 + 测试 | 本 PLAN |
| **commit 7b** | WEBUI agents 详情 Talk to agent 输入框 | 后续 |

## 2. commit 7a 改动

### 新增
- `src/infrastructure/llmClient/toolSchemaAdapter.js` — `toOpenAITools(toolDefs)`：Zod paramsSchema → OpenAI function tools（zod-to-json-schema，`$refStrategy:'none'` 内联）
- `src/agentManager/agentRunner.js` — `runAgentLoop({agent,prompt,deps,ctx,maxIterations})`：
  - messages = [system(agent persona), user(prompt)]
  - 循环：`llmClient.chat({model,messages,tools})` → 有 tool_calls 则白名单校验 + `executeTool(name,args,{db})` + observation 回灌（role:tool）→ 无 tool_calls（final）或达 maxIterations 停
  - 每轮 `ioorRecorder.record({toolCalls,observations,...})`
- `tests/integration/agentRunner.test.js` — 5 用例（回灌/白名单/tool 失败/max_iterations/无 tools 退化）
- `tests/e2e/agentInvoke.e2e.test.js` — 4 用例（真 PA tool 调用/白名单拒绝/404/400）

### 改动
- `openaiClient.js` — `chat()` 加 `tools` 透传（`tool_choice:'auto'`）；`normalizeChatResponse` 加 `toolCalls` 解析（`message.tool_calls` → `[{id,name,arguments}]`，args JSON.parse 失败保留 `{_raw}`）
- `agentController.js` — 加 `POST /:id/invoke`（抽 `mountInvokeRoute` 控行数）；`buildRouter(service, invokeDeps)` 第二参注入运行时依赖
- `server.js` — `stubLLMClient()` → `resolveLLMClient(overrides)`（`LLM_PROVIDER` 切换）；`deps` 暴露 `llmClient/toolRegistry/db`；`buildAgentRouter` 传 invokeDeps
- `.env.example` — `LLM_PROVIDER=stub|openai` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `AGENT_MAX_ITERATIONS=8`
- `package.json` — 加 `zod-to-json-schema` 依赖

### REST 契约
```
POST /agents/:id/invoke
body: { prompt: string(1-8000), sessionId?: string }
200: { success:true, data: {
  content: string,
  turns: [{ turnIndex, content, toolCalls:[{id,name,arguments}], observations:[{name,ok,data|error}] }],
  tokenUsage: { prompt, completion, total, cached_prompt_tokens },
  stopReason: 'final' | 'max_iterations'
}}
```

## 3. 决策落地

| 编号 | 决策 | 实现 |
|---|---|---|
| D-1 | OpenAI-compatible | 复用 openaiClient + OPENAI_BASE_URL 可指任意兼容端点 |
| D-2 | 完整 tool loop | agentRunner 多轮循环 |
| D-3 | invoke 同步 | `POST /:id/invoke` 一次请求跑完多轮 |
| D-4 | zod-to-json-schema | toolSchemaAdapter |
| D-6 | stub 默认 | `LLM_PROVIDER` 未设 → stub；547→556 测试不破 |
| D-8 | max_iterations | 默认 8（env `AGENT_MAX_ITERATIONS`） |
| D-9 | tool 白名单 | loop 内 `agent.tools` Set 校验；越界 → `ok:false` observation 回灌 LLM（不执行） |
| D-10 | IOOR 全留痕 | 每轮 `record()`，toolCalls/observations 数组（落实 AA-SEAC §4.2）；落库走 ioorRecorder 既有双脱敏管道 |

## 4. 关键设计

- **nodeRunner 未改**：workflow agent 节点保持现状（纯对话 + selfHealing）。agentic loop 仅走 invoke 路径，避免冲击现有 workflow 语义与 547 测试。nodeRunner 复用 agentRunner 留作后续（风险评估后再定）。
- **invoke ctx.executionId**：`inv_<hex>`（非 workflow execution），让 IOOR 能按"执行"归集。
- **tool context.db**：`executeTool(name,args,{db})`，db 来自 `deps.db`（= `overrides.db`），生产为 undefined 时 tool handler 回退 `getDb()`。
- **assistant turn 协议**：带 tool_calls 的 assistant message 用 normalize 后数据重建 `{id,type,function:{name,arguments:JSON.string}}`，满足 OpenAI 协议（tool result 必须紧跟）。

## 5. 验收

- `agentRunner.test.js` 5/5 + `agentInvoke.e2e.test.js` 4/4
- 全量 `npx jest`：556 passed / 15 skipped / 0 failed（零回归，新增 9）
- eslint：0 error（`buildDependencies` 复杂度 15 warning 为既有，feedback 备案容忍）

## 6. 不在范围

- ❌ nodeRunner 改造（workflow agent 节点仍纯对话）
- ❌ SSE 流式（V2.2）
- ❌ Anthropic native client（OpenAI-compatible 端点覆盖）
- ❌ 对话历史 UI 展示
- ❌ release tag

## 7. 运维须知

- 真实接入需 `LLM_PROVIDER=openai` + `OPENAI_API_KEY`；未配 key + provider=openai → openaiClient 调用时抛 `LLM_ERROR`
- 默认 `LLM_PROVIDER=stub`：invoke 返回空 content + `stopReason:'final'`（stub chat 无 toolCalls）
- 每次 invoke 多轮 LLM 调用，token 成本随 turns 增长；max_iterations 兜底
