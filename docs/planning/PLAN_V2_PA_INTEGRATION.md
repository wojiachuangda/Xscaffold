// [planner] ID: PLAN-V2-PA-INTEGRATION | Date: 2026-05-20 | Description: Project Assistant 9 个 REST endpoint + WEBUI Projects 深度接入；后端已 CONFIRM 开工

# V2-PA 实施计划 — Project Assistant 深度接入 WEBUI

> 触发：用户裁决「主链已跑通的助理 Agent 接入 WEBUI」，选 C 路线（资源浏览 + 创建/编辑）
> 依据：`AGENTS.md` UI 独立维护原则；`Uiconstraints.md` §7 页面布局规范；`RULES.md` 大改动 PLAN→CONFIRM
> 现状：后端 9 tool + 4 repo + digest workflow 稳定（v1.3.0），但**0 个 REST endpoint** 让 WEBUI 访问资源

---

## 1. 拆分

| 阶段 | 范围 | 状态 |
|---|---|---|
| **commit 5** | 后端 9 个 REST endpoint + service + repo 扩展 + 11 个 e2e 测试 | 本 PLAN 覆盖 |
| **commit 6** | WEBUI Projects 视图（用户自行实现，并行进行） | 用户做 |

后端独立 commit 让 e2e 先把关；前端用户自己做（已给字段契约 + mock JSON `WEBUI/mock-data.json`）。

---

## 2. 后端修改范围（commit 5 已完成）

### 2.1 扩展现有 repository（不破坏既有方法签名）

- `projectRepository.listAll(filter?: {status?, health?, limit?, offset?})` → `{items, total}` —— sidebar 需要列所有 project
- `eventRepository.listByProject(projectId, {limit?, offset?})` → `{items, total}` —— 现有 `listRecent` 无分页 + 无 total

### 2.2 新增文件

- `src/domain/projectAssistant/projectAssistantService.js` —— 薄业务层组合 4 个 repo，statefully 校验「project 必须存在」（PUT 除外）
- `src/domain/projectAssistant/projectAssistantController.js` —— 9 个 REST endpoint，含 URL `:id` vs `body.projectId` 一致性校验
- `tests/e2e/projectAssistant.e2e.test.js` —— 11 个 e2e 用例

### 2.3 schema 新增（在既有 schema 文件内）

- `projectSchema.js`：`ListProjectsFilterSchema` + `ProjectIdParamSchema`
- `eventSchema.js`：`EventPageQuerySchema`
- `reminderSchema.js`：`ListProjectRemindersQuerySchema`（before 可选，controller 默认填 now+7d）
- `taskSchema.js`：`ProjectTasksQuerySchema`（projectId 从 URL 注入，从 query 剥离）

### 2.4 改动 `src/apiGateway/server.js`

- `buildDependencies`：装配 `projectAssistantService`，4 repo 默认从 `overrides.db` 构造；任一 repo 也可独立 override
- `buildDefaultPaService` helper：避免 `buildDependencies` 复杂度超线
- `mountProtectedRoutes`：`app.use('/projects', buildProjectAssistantRouter(deps.projectAssistantService))`

---

## 3. 9 个 REST endpoint

| 方法 | 路径 | Schema | 行为 |
|---|---|---|---|
| GET | `/projects` | `ListProjectsFilterSchema` (query) | listAll + status/health 过滤 + 分页 |
| GET | `/projects/:id` | `ProjectIdParamSchema` (params) | getByProjectId（不存在 404） |
| PUT | `/projects/:id` | params + `UpdateProjectStatusSchema` (body) | upsertStatus；URL:id 与 body.projectId 必一致 |
| GET | `/projects/:id/tasks` | params + `ProjectTasksQuerySchema` (query) | taskRepository.list；status/priority 过滤 + 分页 |
| POST | `/projects/:id/tasks` | params + `UpsertTaskSchema` (body) | 201；一致性校验 |
| GET | `/projects/:id/events` | params + `EventPageQuerySchema` (query) | listByProject + 分页 |
| POST | `/projects/:id/events` | params + `RecordEventSchema` (body) | 201；不可变流水 |
| GET | `/projects/:id/reminders` | params + `ListProjectRemindersQuerySchema` (query) | listDue；before 默认 now+7d |
| POST | `/projects/:id/reminders` | params + `CreateReminderSchema` (body) | 201 |

---

## 4. 决策表（D-V2-PA-*）

| 编号 | 决策 | 决议 | 理由 |
|---|---|---|---|
| D-1 | controller 放哪 | `domain/projectAssistant/` | 与 agents（src/agentManager/agentController.js）一致 |
| D-2 | service 是否必要 | 必要 | 跨 4 repo 编排 + 一致性校验集中（project 必须存在前置） |
| D-3 | 复用 tool 路径 | 不复用，直接 controller→repo | tool 是 LLM 接口（含 reasoning_content / turnIndex），REST 直接 controller 更干净 |
| D-4 | URL/body projectId 不一致 | 400 VALIDATION_ERROR | 早返；避免脏数据进 service |
| D-5 | events 排序 | createdAt DESC | 与既有 `listRecent` 一致 |
| D-6 | reminders 默认 before | now + 7 天 | "近期要做的事"；user 体验合理；可显式覆盖 |
| D-7 | listReminders projectId 来源 | URL 路径强制注入 | 简化 GET 路径；跨 project 查询通过 tool 路径完成（不在 REST 暴露） |
| D-8 | 重写既有 listRecent | 否，新加 listByProject | 既有 tool 调用方依赖 listRecent，不破坏 |

---

## 5. 测试覆盖（commit 5 内）

`tests/e2e/projectAssistant.e2e.test.js` 11 用例：

1. PUT 首次创建 → GET 取回
2. PUT body.projectId 与 URL 不一致 → 400
3. GET 不存在 project → 404
4. GET /projects 返回 listAll + 分页 meta
5. GET /projects?health=yellow 过滤
6. POST task → GET tasks 取回
7. GET /projects/:id/tasks?status=open 过滤
8. POST event → GET events 取回
9. POST reminder → GET reminders 默认 before 7 天
10. POST task 在不存在 project → 404
11. 未鉴权访问 → 401

**回归**：全量 `npx jest` 547 passed / 15 skipped / 0 failed。

---

## 6. 不在范围（commit 5）

- ❌ 前端 Projects 视图（commit 6，用户自己实现）
- ❌ Delete task / reminder（既有 repo 无 delete；status 改用 upsert）
- ❌ externalAgentCallRepository 展示（暂时跳过；可后续加 tab）
- ❌ 跨 project listReminders（REST 仅 :id 路径暴露；跨项目走 tool）
- ❌ SSE 实时更新（V2.2）
- ❌ release tag

---

## 7. 提交计划

```
commit 5: feat(project-assistant): 9 个 REST endpoint + service + repo 扩展（V2-PA 后端）
```

不打 release tag。

---

## 8. 已知 caveat

- `projectRepository.listAll` 不支持 `name` 模糊搜索（MVP 不必要；项目量少）
- 时间字段 created_at/updated_at 在 SQL 是 TEXT，依赖 ISO 字典序排列 —— 与既有 executionStore 一致，PG 侧已通过 `xs_iso_now()` 兜底
- 复杂度：`buildDependencies` 已为已知超线 warning（feedback_testing.md 记录），本期通过 helper 抽取避免再升
