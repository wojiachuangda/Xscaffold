# PLAN — Agent 对话独立环节设计（MVP）

> 阶段：PLAN（待 CONFIRM）
> 来由：Talk UI 已从 agents 监控视图移除（commit `ffbd13e`），后端
> `POST /agents/:id/invoke` agentic loop 保留。用户裁定：对话交互另立独立
> 环节，「后端能力别动」。本 PLAN 定形态 + 实现范围；CONFIRM 后进 CODE。

## 1. 硬约束

- `WEBUI/.../rules/Uiconstraints.md` 明确禁止 **chat UI 风格**（气泡 /
  对话框）、AI 拟人化（机器人头像 / "Hi! I'm your AI"）、营销语言。
  视觉对标 Temporal / Linear / Kubernetes Dashboard，**不是 ChatGPT**。
- 后端 `/agents/:id/invoke` 不动。契约：
  `body: { prompt: string(1-8000), sessionId?: string(1-128) }`，
  返回 `{content, turns[], tokenUsage, stopReason}`。
  `sessionId` 是 ctx 透传给 runAgentLoop，**是否真做消息历史 threading
  代码未明示** —— MVP 不依赖后端续话。
- 不引新依赖；vanilla ESM、tokens.css / Tailwind CDN 复用既有。

## 2. 设计空间 & 推荐组合

| 轴 | 选项 | 推荐 | 理由 |
|---|---|---|---|
| 视图名 | Sessions / Console / Notebook / Workbench / Logs | **Sessions** | 与 Runtime/Agents/Inbox 同英文 ops 词汇系列；Console 可接受备选 |
| IA 位置 | 新顶级 view `#/sessions` / modal / 右侧 dock / 改造 assistant | **新顶级 view** | nav 系刚补齐，加一项最一致；dock/modal 是 chat 反模式 |
| 续话模型 | 后端无状态（每 invoke 独立）/ 客户端拼 messages 历史送上 / 扩展后端 invoke | **后端无状态（MVP）** | 用户要求别动后端；一个 session 是「同 agent + 同主题」的**时序日志**，非自动续话；想续话用户自行把上轮 answer 复制进新 prompt |
| 持久化 | localStorage / 服务端新表 | **localStorage（MVP）** | 与原 Talk history 路径一致；新 key 命名空间 `xscaffold.session.*`，与老的 `xscaffold.agent.history.*` 不冲突 |
| 与 executions 关系 | 独立 / 写入 executions 表 / 深度集成 | **独立** | 不污染执行历史；V2 再议是否纳入 |
| 单元渲染 | Notebook cell（结构化）/ chat bubble / 折叠 detail / 复用 turnHtml | **复用既有 turn 结构化样式（card + tl-dot）** | 与移除前的 invokeResultHtml 视觉一致；非 chat bubble |
| 在轮询路径 | 在 / 否 | **否** | 无服务端实时数据；session 是用户操作驱动 |

## 3. MVP 形态草图

布局（参考 agents / inbox 既有三栏）：

```
┌──────────────────────────┬──────────────────────────────────────────────┐
│ Sessions（左 w-list）    │ Selected session（右 main）                   │
│ [+ New session]          │ ┌────────────────────────────────────────────┐│
│ ─ project-assistant ·    │ │ header: agent · topic（可改名）· · 3 cells ││
│   "排查数据漂移" ·       │ ├────────────────────────────────────────────┤│
│   3 cells · 14:32        │ │ ▼ Cell #1                                  ││
│ ─ outlier-watcher ·      │ │   prompt: 列出 xscaffold 任务               ││
│   "全量诊断" · 1 cell    │ │   turns（复用 tl-dot 时间线）:              ││
│ ...                      │ │     · turn 1 · 2 tool calls                ││
│                          │ │       → projectGetStatus · ok              ││
│                          │ │       → taskList · ok                      ││
│                          │ │     · turn 2 · final                       ││
│                          │ │   answer: ...（bg-soft bd rounded p-3）    ││
│                          │ │   meta: 2 turns · 5139 tok · final         ││
│                          │ │ ▼ Cell #2 ...                              ││
│                          │ ├────────────────────────────────────────────┤│
│                          │ │ [textarea + Send]（sticky 在底部）          ││
│                          │ └────────────────────────────────────────────┘│
└──────────────────────────┴──────────────────────────────────────────────┘
```

特征（强调「非 chat」）：
- cell 是**执行记录**结构：prompt 在顶 / turns 居中（带 dot timeline）/
  answer 在底 / meta 行末。无气泡、无头像、无 "user / assistant" 标签。
- cell 间互相独立（无线程绑线 / 引用箭头）。
- 视觉 token 全部复用：`card` / `bd-b` / `dot-success` / `tl-dot` /
  `term-ok|err` / `t-mono` / `bg-soft`。
- 提交中 cell 显示 "agent thinking…"（复用 `setBusy` 等价文案）。
- 提交完成自动滚到新 cell。

## 4. 修改范围（若推荐组合 CONFIRM）

新增：
- `WEBUI/views/sessions.js` —— ~250 行（list / detail / cell render / 新建 session modal）
- nav `<a data-nav="sessions">` + svg 图标（终端 `>_` 样式较合调性）

改动：
- `WEBUI/index.html` —— nav 加 1 项
- `WEBUI/lib/router.js` —— VIEW_WHITELIST 加 `'sessions'`
- `WEBUI/views/index.js` —— RENDERERS 加 sessions
- `WEBUI/lib/state.js` —— state 加 `sessions: []`、`selectedSessionId`、`sessionsLoaded` 等

不动：
- 后端 / Zod schema / DB —— 零改动
- 轮询路径 —— sessions 不进 POLL_VIEWS（无实时数据）

localStorage 结构（命名空间隔离）：
```
xscaffold.session.list         → [{id, agentId, agentName, topic, createdAt, cellCount}]
xscaffold.session.{id}.cells   → [{prompt, turns, content, tokenUsage, stopReason, invokedAt}]
```

预估 diff：~350 行，约半天。命中 RULES 大改动条件 5（UI 新增 view）+ 10
（新增业务行为）→ 完整 PLAN→CONFIRM 后进 CODE。SPEC 阶段无 Zod 契约
变更，跳过。

## 5. 风险 / 取舍

| 项 | 影响 | 缓解 |
|---|---|---|
| 没有续话 | 用户复杂任务想接着追问要复制上轮 answer 进新 prompt | 文档化「MVP 是日志不是 chat」；V2 评估是否上后端续话 |
| localStorage 跨设备不同步 | 换浏览器看不到本地 session | 接受；V2 再上服务端 |
| 长 token / 多 cell | localStorage 配额 ~5MB，超量会写失败 | 单 session cell 数软上限 50（仅 UI 提示，不阻断）；超 5MB 写失败时 toast 报错而非崩 |
| invoke 失败 | 后端 4xx/5xx | cell 内显示 error block（复用现有 `text-error`），不阻塞 session 其它 cell |
| 既有 `xscaffold.agent.history.*` localStorage 残留 | 老 key 占位但无 UI 读 | 不迁、不删；新 key 完全隔离 |
| 没有 SSE 流式 | 长 invoke（多轮 tool call）会让用户等 | 已知；V2.2 SSE 是另立 backlog，本期不交叉 |

## 6. 验收（CONFIRM 进 CODE 后手动）

1. nav 多一个 Sessions 入口，#/sessions 进得去
2. New session → 选 agent → 输 topic → 进入空 session
3. 输 prompt → Send → cell 出现，turns 时间线 / answer / meta 全显示
4. 多发几个 prompt → cell 累积、时序正确
5. 切到别的 session 再切回来 → cell 持久（localStorage 命中）
6. 删除 session → list 移除、localStorage 清理对应键
7. invoke 失败 → cell 显示 error，session 不挂、可继续发
8. console 无报错、不在轮询路径（agents/runtime 行为不受影响）

## 7. 待 CONFIRM 决策点

| # | 决策 | 我的建议 |
|---|---|---|
| D1 | 视图名 | **Sessions**（中英 nav title 一致用 Sessions） |
| D2 | IA 位置 | **新顶级 view `#/sessions`** + 左 nav 加图标 |
| D3 | 续话模型 | **后端无状态、cell 级独立**（MVP） |
| D4 | 持久化 | **localStorage**（MVP）；新命名空间 `xscaffold.session.*` |
| D5 | 与 executions | **独立**，不写 executions 表 |
| D6 | cell 渲染 | **复用 turnHtml 结构化样式**，非 chat bubble |
| D7 | session 创建入口 | **左 nav + 列表顶部 [+ New session]**（MVP）；未来可加 agents 行「Open in Sessions」深链接 |
| D8 | session 元数据 | **agentId / agentName / topic（可编辑）/ createdAt / cellCount** |
| D9 | session 重命名 / 删除 | **支持**（topic 改名、整个 session 删除）；**单 cell 不可删**（保审计完整性） |

附加问题：
- Q1 nav 图标用哪种？建议 **终端样式 `>_`**（最贴 ops console 气质）
- Q2 session 创建是 modal 弹窗还是 inline 表单？建议 **inline**（左 list 顶部展开一个简单表单，少一次交互层级）
- Q3 老的 Talk history（`xscaffold.agent.history.*`）要不要做一键导入？建议 **不做**（用户已经决定 Talk 是另一个环节，导入会模糊边界）

---

**全接受推荐组合**：回 `CONFIRM`，我进 CODE。
**想改某项**：直接说，例如「D1 用 Console」「D3 改后端无状态→客户端拼 messages」等。
