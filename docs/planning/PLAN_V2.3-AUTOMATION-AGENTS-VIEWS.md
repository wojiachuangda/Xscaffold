# PLAN — automation + agents 视图重做（接美术稿 + 真 API）

> 阶段：PLAN（等待 CONFIRM）
> 输入：美术稿 `UI/automation.html`、`UI/agent.html`（按设计文档重做，用项目 token 类）。
> 本期范围：automation + agents 两个视图。runtime（含 Live Logs 后端）单独后做。

---

## 1. 现状

- `WEBUI/views/automation.js`：当前 mock 重（触发器/cron/绑定/spark 全假）。
- `WEBUI/views/agents.js`：list/profile/tools 已真；Active Tasks / Automation Ownership 是 `MOCK_*`。
- 美术交付 2 份重做稿（标准 token 类、严格按 `UI-AUTOMATION-REDESIGN.md` / `UI-AGENTS-REDESIGN.md`）。
- 所需后端**全部已就绪**：`GET /workflows`、`GET /workflows/executions?workflowId=`、
  `POST /workflows/:id/execute`、`GET /agents`。无新端点、无新契约。

---

## 2. 修改范围

| 文件 | 改动 |
|---|---|
| `WEBUI/views/automation.js` | **重写**：工作流目录页（list + Definition + Execution History + Run） |
| `WEBUI/views/agents.js` | **重写**：只读 agent 档案页（list 分组 + Profile + Skills） |

- 单文件各（预计 automation ~230 行 / agents ~200 行，均 ≤500，不拆目录）。
- **丢弃**美术稿的 `<nav>` 和内联 mock 数据/脚本——只取视图内容区结构，接真 API。
- nav/router/RENDERERS 无需改（automation/agents 是既有视图，已注册）。
- 美术稿用的类全部已存在于 tokens（`term*`/`t-lg`/`tab`/`card`/`badge`/`dot` 等核过）；
  稿里 nav 的 `text-n400` 项目没有，但 nav 整段丢弃，无影响。

### automation 数据流
- 进入视图 `GET /workflows` → 列表（name / nodeCount / id / version）。
- 列表行状态点：见决策 D1。
- 选中 workflow → `GET /workflows/executions?workflowId=<id>&limit=20` → Execution History 表。
- Definition 区：description / version / nodeCount（来自 `GET /workflows` 列表项）。
- `Run` 按钮 → `POST /workflows/:id/execute` → 行内 toast「已触发，异步执行」。
- 不入 POLL_VIEWS（沿用 poll-scope 决策）。

### agents 数据流
- 进入视图 `GET /agents` → 列表（按 status 分 Active/Disabled 两组）+ 详情全部字段。
- 详情：Profile（model/status/updatedAt/description/createdAt）+ Skills（`tools` 数组 → badge）。
- `Open in Sessions` 按钮：见决策 D2。
- 列表 + 详情都只来自 `GET /agents`，无额外 fetch。不入 POLL_VIEWS。

---

## 3. 风险评估

- 替换 2 个既有视图，纯前端；不碰后端、不碰契约、不碰其它视图与 nav/router。
- automation/agents 当前就不在 POLL_VIEWS，重写后保持——无轮询干扰。
- 真 API → 真 seed 数据（automation：3 workflows；agents：4 agents）。
- 美术稿的执行历史表用 `<table>`——确认 tokens 下表格样式可用（executions/projects 已用类似）。
- 验证：headless `curl` 各端点确认形态 + ESM 语法 + WEBUI serve；浏览器眼验留用户。

无 Zod 契约变更 → SPEC 阶段 N/A。

---

## 4. 待 CONFIRM 的决策点

| # | 决策 | 我的建议 |
|---|------|---------|
| D1 | automation 列表行的「最近执行状态点」 | **做**：进入视图后对每个 workflow 并行拉 `executions?workflowId=&limit=1` derive 状态点（workflow 少，N+1 fetch 可接受）。比中性点更贴美术稿 |
| D2 | agents「Open in Sessions」按钮行为 | **先只跳转** `#/sessions`（纯前端 hash 跳）。预选该 agent 需给 sessions 加入参，属增强，本期不做 |
| D3 | 美术稿里的占位文案（如 automation 的 "last 8 of 312"、runtime 风格数字） | 全部换成真数据；真数据为空时走诚实空态（"No executions yet" 等） |

提交：按已生效的偏好——**验证通过后自动 commit + push**，不再单独问。
（注：之前"先不提交"的 inbox 删按钮 + 4 份 UI 文档，hold 原因是"等美术轮"，美术已交付——
是否随本次一起提交，完成时我会问一次。）

---

## 5. 执行顺序（CONFIRM 后）

1. 读 `automation.js` / `agents.js` 现状全文 + 美术稿细节
2. 重写 `agents.js`（更简单，纯 `GET /agents`）→ headless 验证
3. 重写 `automation.js`（list + 详情 + Run）→ headless 验证
4. ESM 语法 + WEBUI serve 全过 → 自动 commit + push
5. 回报 + 用户浏览器眼验
