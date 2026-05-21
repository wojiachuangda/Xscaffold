# PLAN — Projects 视图（接 Project Assistant API 进 UI）

> 阶段：PLAN（等待 CONFIRM 后进 CODE）
> 方向：用户校准——后端 API 已就绪，把它接进 UI / 替换占位。本次=新建 Projects 视图，
> 接已挂载的 `/projects` 9 端点（PA 功能后端全有、UI 零）。

---

## 1. 现状分析

- 后端 `/projects` 已挂载 9 端点（`server.js:275` + `projectAssistantController.js` 核对）：
  `GET /`、`GET /:id`、`PUT /:id`、`GET|POST /:id/tasks`、`GET|POST /:id/events`、`GET|POST /:id/reminders`。
- 真实 Zod 实体（projectSchema/taskSchema/reminderSchema/eventSchema）字段名与 `WEBUI/mock-data.json`
  **完全一致** → mock 是布局参考，真 API 返回同形态，接线零猜测。
- dev DB 已 seed 真实 project 数据（xscaffold / inventory-sync / billing-rewrite）。
- UI 侧：**没有 Projects 视图**。`assistant.js` 只是隐藏的手动 digest 触发，非 Projects。
- 响应 envelope：列表 `{success,data:[],meta:{total,limit,offset}}`，单体 `{success,data}`。
- `api(path)`（`lib/api.js`）返回整个 payload；读 `payload.data` / `payload.meta`。

实体字段：
- Project：projectId / name / phase / status(active|paused|done|blocked) / health(green|yellow|red) / completion(0-100) / summary / updatedAt
- Task：taskId / title / status(open|in_progress|blocked|done|skipped) / priority(low|normal|high|urgent) / notes / updatedAt
- Reminder：reminderId / title / content / dueAt / severity(low|normal|high) / status(open|done|dismissed)
- Event：eventId / type / title / content / severity(low|normal|high|critical) / createdAt

---

## 2. 修改范围（D1 已定=读+写 → 目录拆分，沿用 sessions/ 范式）

读+写体量大（4 类展示 + 4 种写表单 + 状态编辑），单文件必超 500 → 直接建目录：

| 文件 | 改动 | 类型 |
|---|---|---|
| `WEBUI/views/projects/api.js` | **新建**：`/projects` 全部读写调用（list/get/listTasks/upsertTask/listReminders/createReminder/listEvents/recordEvent/updateStatus） | 新文件 |
| `WEBUI/views/projects/render.js` | **新建**：纯 HTML builder（项目行/profile/task·reminder·event 行 + badge 映射 + 各 add 表单模板） | 新文件 |
| `WEBUI/views/projects/index.js` | **新建**：shell + 列表 + 详情编排 + 表单 toggle/提交 handler + 导出 `renderProjects` | 新文件 |
| `WEBUI/index.html` | nav 加 `#/projects` 图标（sessions 之后） | +~3 行 |
| `WEBUI/lib/router.js` | `VIEW_WHITELIST` 加 `'projects'` | +1 行 |
| `WEBUI/views/index.js` | import `./projects/index.js` + RENDERERS 注册 | +2 行 |

**写操作 UI**（沿用 sessions 的 inline 折叠表单范式，不用 modal 表单）：
- Tasks/Reminders/Events 各一个「+ Add」按钮 → 展开 inline 表单 → 提交 POST → 重拉该区块
- Profile 一个「Edit」→ 内联可编辑 phase/status/health/completion/summary → Save 走 PUT /:id
- 写成功后只重渲染受影响区块（不整页重画）；写失败 showToast

**布局**（参考 Uiconstraints §7 Agent 页面 + 现有 executions/sessions 3 栏范式）：
- 左：项目列表项 = `[health 圆点] 项目名 [completion% / status badge]`
- 右详情 4 区块（细线分隔，不卡片套卡片）：
  1. **Profile**：name / phase / status / health / completion / summary / updatedAt
  2. **Tasks**：列表（status + priority badge）
  3. **Reminders**：按 dueAt 升序（severity + 到期时间）
  4. **Events**：时间线（type / title / severity / createdAt）

**数据流**：进入视图 `GET /projects` → 渲染列表 + 选中首个（或 `state.selectedId`）→
选中项并行 `GET /:id/tasks` + `/reminders` + `/events` → 渲染右侧。**不入 POLL_VIEWS**
（沿用 poll-scope 决策：交互/详情类视图不参与 5s 轮询重渲染）。

**复用**：`lib/api.js` 的 `api()`、`escapeHtml/formatTime` 等 utils、现有 badge/dot/text 颜色类。

---

## 3. 风险评估

- **纯新增**：除 4 处注册（nav/router/RENDERERS）外不动任何现有视图，回归面≈0。
- 真 API → 真 seed 数据，进去就有内容（非占位）。
- 字段名已与真 schema 对齐，无"显示空白"风险。
- 单文件可能偏大（列表 + 4 区块 + badge 映射）。控制在 500 行内；超 ~450 就地拆 `views/projects/`。
- 验证：后端需起（`AUTH_DISABLED=true` + seed 过的 DB）。可先 `curl /api/projects` headless 确认 API 返数据；
  视图渲染需浏览器眼验（无 e2e）。

无 Zod 契约变更（消费既有 API）→ SPEC 阶段 N/A。

---

## 4. 待 CONFIRM 的决策点

| # | 决策 | 我的建议 |
|---|------|---------|
| D1 | 本次是否含写操作 | **只读优先**：先把 4 类数据"呈现"出来（你的原话=接出来/呈现）。POST task/reminder/event + PUT status 表单留作下一步。范围小、风险低 |
| D2 | 单文件 vs 目录 | **先单文件** `views/projects.js`，超 450 行就拆 `views/projects/`（沿用 sessions 拆法） |
| D3 | nav 图标位置 | 放 **sessions 之后**（Projects 属同类工作面板）。图标用 layers/clipboard 类 |

**附加问**：commit 一个（`feat(webui): Projects 视图接入 /projects API`），跑通后 push？沿用上次节奏。

---

## 5. 执行顺序（CONFIRM 后）

1. `views/projects.js`：shell + 项目列表 + 列表 fetch/select
2. 详情 4 区块渲染 + 并行 fetch tasks/reminders/events
3. 注册：router whitelist + RENDERERS + index.html nav 图标
4. headless：起后端(AUTH_DISABLED+seed) + `curl /api/projects` 确认返数据；WEBUI `curl` 确认 projects.js 200
5. 回报 + 你浏览器眼验 `#/projects` + 定 commit/push
