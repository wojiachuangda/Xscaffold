# PLAN v2 — WEBUI 轮询作用域收窄 + 移除 agents 视图内 Talk UI

> 阶段：PLAN（v1 poll-scope 部分已 CONFIRM；v2 追加 Talk UI 移除，待 CONFIRM）
> 决策来由：
> - 用户否决 morphdom「给整段重渲染加 diff」的补丁路线 → 改为收窄轮询作用域。
> - 用户进一步指出：Talk-to-agent 对话 UI 不该塞进 agents 监控视图，
>   「用户交互体验放到其他环节进行，没必要在这里强行打补丁」→ 移除该 UI。

## 第一部分：轮询作用域收窄（已 CONFIRM）

### 1.1 现状
5s 轮询 `pollTick` → `render()` 无差别重渲染当前整个 view。带 textarea /
input 的 view 被整段重贴 → 输入内容、焦点、光标丢失。创可贴
`hasActiveFormInput()`（4555f98）「有焦点就整轮跳过」副作用是打字时整页冻结。

但只有 `runtime`（探针）/ `inbox`（新故障）真需 5s 实时刷；
`agents`/`automation`/`settings`/`assistant` 是配置数据或表单，无实时需求。

### 1.2 改动（`app.js`）
- 新增 `POLL_VIEWS = new Set(['runtime', 'inbox'])`
- `pollTick` 末尾：`if (POLL_VIEWS.has(state.view)) render();`
- 删 `hasActiveFormInput()` 整个函数 + 跳过逻辑

## 第二部分：移除 agents 视图内 Talk-to-agent UI（v2 追加，待 CONFIRM）

### 2.1 来由
Talk UI（textarea + Send + 结果区 + localStorage 对话历史）被嵌进 agents
**监控视图**的详情区。用户裁定：监控视图回归纯展示，对话交互另立环节。
**只拆前端 UI，不动后端能力。**

### 2.2 删 / 留 清单（仅 `WEBUI/views/agents.js`，全自包含，无其它文件引用）

**删除：**
- `talkSectionHtml` —— textarea `#agent-prompt` + Send + 结果区
- `bindTalk` / `invokeAgent` / `setBusy` / `invokeResultHtml` / `turnHtml`
- Talk 对话历史整套：`historyStorageKey` / `loadHistory` / `pushHistory` /
  `clearHistory` / `refreshHistoryBlock` / `historyListInnerHtml` /
  `historyEntryHtml` / `bindHistoryClear` / `HISTORY_LIMIT`
- `renderDetail` 内：`${talkSectionHtml(agent)}` 段、Talk history 卡片段、
  `bindTalk()` + `bindHistoryClear()` 调用
- 失活的 import：`api`、`showToast`（删 Talk 后无引用）
- 文件头注释中 Talk 相关描述同步修正

**保留：**
- agents 列表 / 行选中、agent profile、Active Tasks（mock）、Tools、
  Automation Ownership（mock）—— agents 视图回归纯监控
- `renderDetail` 的第二个 grid 由 `[Talk history] [Automation Ownership]`
  收拢为只剩 Automation Ownership（布局相应调整）
- **后端 `POST /agents/:id/invoke` agentic loop 完全不动** —— 系统能力保留

### 2.3 影响
- agents.js 约 386 → ~210 行
- 用户浏览器内遗留 `xscaffold.agent.history.*` localStorage key（无害，
  dev 环境，不做清理迁移）

## 3. 修改范围评估
- 文件：`WEBUI/app.js` + `WEBUI/views/agents.js` = **2 文件**
- 预估 diff：app.js ~20 行；agents.js 删 ~175 行 / 改 ~15 行
- 无新依赖、无后端 / API / DB / Zod 改动；morphdom 不引入
- 命中 RULES 大改动条件 10（改变现有业务行为）→ 走完整 PLAN→CONFIRM
- 阶段 2 SPEC：无契约 / Schema 变更，无产出。CONFIRM 后直接 CODE。
- 后端 562 jest 测试不受影响（WEBUI 独立项目，无自动化测试）

## 4. 预估可能破坏的已有业务 / 取舍

| 项 | 影响 | 评估 |
|---|---|---|
| 打字被冲 / 失焦 | **消失** —— 交互区 view 脱离轮询路径 | 目标达成 |
| Talk-to-agent UI | 从 agents 视图**移除** | 用户明确裁定；交互另立环节 |
| 后端 invoke 能力 | 不动 | 系统能力保留，可供日后新环节调用 |
| agents/automation/executions 列表 | 不再 5s 自动刷，按需刷新 | 配置/弱实时数据，可接受 |
| runtime / inbox | 行为不变，仍 5s 实时刷 | 真实时需求保留 |

## 5. 验收（手动）
后端 + WEBUI 起：
1. agents 视图：无 Talk 输入框 / 无对话历史卡片；profile / tasks / tools /
   automation ownership 正常显示；选 agent 切换正常
2. settings / assistant 表单输入跨轮询（≥10s）不丢、不失焦
3. runtime → 探针状态仍随轮询更新
4. inbox → 新失败项仍随轮询冒出；切过滤、选行正常
5. executions → 改 status/workflow 过滤、翻页正常刷新
6. 浏览器 console 无报错（确认无残留对 `api`/Talk 函数的引用）

## 6. 待 CONFIRM 的决策点

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D1 | Talk UI 处理 | A 直接删除 / B 降级保留 | **A 删除** —— 降级会留「有历史无入口」半残态，正是用户否决的「强行打补丁」 |
| D2 | 后端 `/agents/:id/invoke` | 删 / 留 | **留** —— 系统真能力，用户明确「不改变系统本身能力」 |
| D3 | commit 粒度 | 1 个 / 拆 2 个 | **1 个** —— `fix(webui): 轮询只重渲染实时 view + 移除 agents 视图内 Talk UI` |
