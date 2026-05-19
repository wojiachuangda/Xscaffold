// [planner] ID: PLAN-PROJECT-ASSISTANT-MVP | Date: 2026-05-19 | Description: 项目助理 Agent MVP 闭环计划

# Project Assistant MVP 计划

> 目标：先做出一个真正可用的“项目助理 Agent”闭环。  
> 该阶段暂缓 PostgreSQL、BullMQ、多 Agent A2A、自动写代码、自动审代码。

---

## 1. 一句话目标

项目助理负责：

```text
跟踪项目进度
同步项目状态
记录重要事件
生成下一步任务
创建提醒
调用外部常驻 HTTP Agent 获取分析结果
输出项目摘要
```

它不负责：

```text
直接写代码
直接审代码
自动 push
自动 release
任意命令执行
```

---

## 2. 第一版角色边界

第一版只需要一个核心 Agent：

```text
project-assistant
```

它是总控助理，不是开发 Agent。

后端开发、代码审核、复杂问题分析可以交给外部 CLI / HTTP Agent 服务。Xscaffold 只通过 Tool 调用它们，并记录结果。

---

## 3. 核心闭环

第一版必须跑通这条链路：

```text
用户询问项目状态
    ↓
project-assistant 读取本地项目状态
    ↓
project-assistant 调用 externalAgentSend
    ↓
外部常驻 HTTP Agent 返回分析
    ↓
project-assistant 记录 event
    ↓
project-assistant 更新 project status
    ↓
project-assistant 更新 task / reminder
    ↓
project-assistant 生成 digest
    ↓
返回给用户
```

---

## 4. 固定 Tool 清单

第一版固定 9 个 Tool：

| Tool | 目的 | 必需 |
|---|---|---:|
| `projectGetStatus` | 读取项目状态 | 是 |
| `projectUpdateStatus` | 更新项目状态，仅允许 `phase/status/health/completion/summary` | 是 |
| `taskList` | 列出任务 | 是 |
| `taskUpsert` | 创建或更新任务 | 是 |
| `eventRecord` | 记录重要事件 | 是 |
| `reminderCreate` | 创建提醒 | 是 |
| `reminderListDue` | 查询到期提醒 | 是 |
| `externalAgentSend` | 给外部常驻 HTTP Agent 发送指令 | 是 |
| `projectGenerateDigest` | 生成项目摘要 | 是 |

说明：

```text
projectGenerateDigest 必须包含最近 10 条 event。
external_agent_calls 不暴露独立列表 Tool。
所有 Tool 的 projectId 在 MVP 阶段都保持必填。
```

这些 Tool 的参数结构与通用规范见：

```text
docs/tool-dev.md
```

---

## 5. 数据结构

第一版至少需要 5 类数据：

```text
projects
tasks
events
reminders
external_agent_calls
```

代码组织：

```text
src/domain/projectAssistant/
├── schemas/
└── repositories/
```

迁移组织：

```text
006_create_project_assistant_core.sql
007_create_external_agent_calls.sql
```

### 5.1 Project

```json
{
  "projectId": "xscaffold",
  "name": "Xscaffold",
  "phase": "A.1",
  "status": "active",
  "health": "green",
  "completion": 76,
  "summary": "A.1 async repository contract 已完成，CI 全绿。",
  "updatedAt": "2026-05-19T00:00:00.000Z"
}
```

字段约束：

```text
status: active | paused | done | blocked
health: green | yellow | red
completion: 0-100
```

### 5.2 Task

```json
{
  "taskId": "agent-loop-demo",
  "projectId": "xscaffold",
  "title": "实现 Agent 闭环 demo",
  "status": "open",
  "priority": "high",
  "notes": "需要 workflow 自动加载和 smoke 脚本。",
  "updatedAt": "2026-05-19T00:00:00.000Z"
}
```

字段约束：

```text
status: open | in_progress | blocked | done | skipped
priority: low | normal | high | urgent
```

### 5.3 Event

```json
{
  "eventId": "event_xxx",
  "projectId": "xscaffold",
  "type": "ci_passed",
  "title": "CI 全绿",
  "content": "A.1 修复后 GitHub Actions 全部通过。",
  "severity": "high",
  "createdAt": "2026-05-19T00:00:00.000Z"
}
```

字段约束：

```text
severity: low | normal | high | critical
```

### 5.4 Reminder

```json
{
  "reminderId": "reminder_xxx",
  "projectId": "xscaffold",
  "title": "检查 Agent 闭环 smoke",
  "content": "确认 math-demo workflow 能执行成功。",
  "dueAt": "2026-05-20T09:00:00+08:00",
  "severity": "normal",
  "status": "open"
}
```

字段约束：

```text
severity: low | normal | high
status: open | done | dismissed
```

### 5.5 ExternalAgentCall

```json
{
  "callId": "extcall_xxx",
  "projectId": "xscaffold",
  "profile": "claudeHttp",
  "sessionId": "xscaffold-main",
  "instruction": "请检查当前项目状态，说明阻塞点和下一步建议。",
  "status": "completed",
  "reply": "当前项目 A.1 已完成，CI 全绿...",
  "summary": "A.1 完成，建议进入 Agent 闭环 demo。",
  "durationMs": 53210,
  "createdAt": "2026-05-19T00:00:00.000Z"
}
```

字段约束：

```text
status: pending | completed | failed | timeout
```

该表不对项目助理暴露独立 Tool，仅供审计、排错和 digest 内部读取。

---

## 6. externalAgentSend 协议

外部 CLI 工具是后台常驻 HTTP 服务，并且它自己维护完整对话上下文。Xscaffold 不直接维护它的完整上下文，只传 `sessionId`。

### 6.1 Tool 输入

```json
{
  "projectId": "xscaffold",
  "profile": "claudeHttp",
  "sessionId": "xscaffold-main",
  "instruction": "请检查当前项目状态，说明阻塞点和下一步建议。",
  "expectation": "返回 Markdown 摘要，包含当前状态、风险、下一步。",
  "timeoutMs": 120000
}
```

字段约束：

```text
projectId: 1-128 字符
profile: 白名单，例如 claudeHttp
sessionId: 1-128 字符，只允许字母/数字/下划线/中划线/点
instruction: 1-12000 字符
expectation: 0-2000 字符
timeoutMs: 1000-180000
```

### 6.2 Tool 输出

```json
{
  "ok": true,
  "data": {
    "projectId": "xscaffold",
    "profile": "claudeHttp",
    "sessionId": "xscaffold-main",
    "status": "completed",
    "reply": "当前项目 A.1 已完成，CI 全绿...",
    "summary": "A.1 完成，建议进入 Agent 闭环 demo。",
    "durationMs": 53210,
    "raw": {}
  }
}
```

### 6.3 外部 HTTP 请求

不要让 Agent 传 URL。服务端固定 profile：

```js
const EXTERNAL_AGENT_PROFILES = {
    claudeHttp: {
        baseUrl: 'http://127.0.0.1:4567',
        endpoint: '/messages',
        method: 'POST',
        timeoutMs: 120000,
    },
};
```

发送给外部服务的请求体建议固定：

```json
{
  "sessionId": "xscaffold-main",
  "message": "请检查当前项目状态，说明阻塞点和下一步建议。",
  "metadata": {
    "projectId": "xscaffold",
    "source": "xscaffold",
    "expectation": "返回 Markdown 摘要，包含当前状态、风险、下一步。"
  }
}
```

如果外部 HTTP 服务协议不同，需要在 `externalAgentSend` 内部做 adapter，不能把外部协议泄漏给项目助理。

输出截断：

```text
reply: 最大 32KB
raw: 最大 8KB
IOOR/日志二次记录: 最大 4KB
```

---

## 7. 安全边界

第一版必须满足：

```text
1. profile 必须白名单。
2. URL 不允许由 Agent 或用户传入。
3. 默认只允许访问 127.0.0.1 或明确配置的可信地址。
4. sessionId 必须限制字符和长度。
5. instruction 必须限制长度。
6. timeoutMs 必须限制最大值。
7. reply/raw 必须限制最大输出长度。
8. 记录 event 前必须走脱敏逻辑。
9. externalAgentSend 不能自动 commit/push/release。
```

---

## 8. 架构决策

### 8.1 必须先定

| # | 决策 | 结论 |
|---|---|---|
| Q1 | migrations 拆分 | 拆 2 个文件：`006_create_project_assistant_core.sql` 建 `projects/tasks/events/reminders`；`007_create_external_agent_calls.sql` 单独记录外部调用日志 |
| Q2 | Repository 与 Schema 目录 | 聚合到 `src/domain/projectAssistant/`，MVP 阶段共享一个域上下文；目录下分 `schemas/` 与 `repositories/` |
| Q3 | `projectUpdateStatus` 可更新字段 | 允许更新 `phase/status/health/completion/summary`；禁止更新 `projectId/name/updatedAt`，`updatedAt` 自动生成 |
| Q4 | event/reminder 重要性字段 | 字段名统一为 `severity`；event 取 `low/normal/high/critical`，reminder 取 `low/normal/high` |
| Q5 | `external_agent_calls` 是否暴露 Tool | 不暴露独立 `externalCallList` Tool；该表仅作内部审计日志，digest 内部可读 |
| Q6 | `projectGenerateDigest` 输出格式 | 参数增加 `format: 'markdown' | 'json'`，默认 `markdown`；`json` 用于程序消费 |
| Q13 | `projects` 行首次落库路径 | 不新增 `projectCreate` Tool（守住 9-tool）；`projectUpdateStatus` 实现为 upsert，首次 insert 时 `name = projectId` 兜底，之后禁止修改 `name`（沿用 Q3） |

### 8.2 建议补充但可推迟

| # | 决策 | 结论 |
|---|---|---|
| Q7 | 是否新增 `eventList` Tool | 不新增；保持 9-tool 固定，`projectGenerateDigest` 必须包含最近 10 条 event |
| Q8 | `projectId` 是否每个 Tool 必填 | 保持必填；MVP 显式优先，后续再考虑 active project context |
| Q9 | 是否依赖 A.1 async Repository 契约 | 是，直接使用 A.1 的 Driver/Repository async 契约，不另建一套同步实现 |
| Q10 | `externalAgentSend` 输出截断 | `reply` 最大 32KB，`raw` 最大 8KB；写入 IOOR/日志时再次截断到 4KB |
| Q11 | smoke 脚本启动方式 | 复用 `createApp + supertest`，不实际 listen 端口；外部 HTTP Agent 用 mock 或 `EXTERNAL_AGENT_PROFILE_OVERRIDE` 切 stub |
| Q12 | release tag | 独立 `v1.3.0`；Project Assistant MVP 是新 feature，`v1.2.0` 留给 V1.5-A/PG 链路 |

---

## 9. 第一版工作流

建议新增工作流：

```text
workflows/project-assistant-digest.yaml
```

逻辑：

```text
1. projectGetStatus
2. taskList
3. reminderListDue
4. externalAgentSend
5. eventRecord
6. projectUpdateStatus
7. projectGenerateDigest
```

第一版不需要复杂条件分支，先保证顺序闭环可执行。

---

## 10. 实施顺序

推荐顺序：

```text
PAM-1: 固定 schema
      - src/domain/projectAssistant/schemas/
      - src/domain/projectAssistant/repositories/
      - migrations 006/007
PAM-2: 实现 projectGetStatus / projectUpdateStatus
PAM-3: 实现 taskList / taskUpsert
PAM-4: 实现 eventRecord
PAM-5: 实现 reminderCreate / reminderListDue
PAM-6: 实现 externalAgentSend
PAM-7: 实现 projectGenerateDigest
PAM-8: 新增 project-assistant-digest workflow
PAM-9: 新增 smoke 脚本
PAM-10: README 增加项目助理快速验证
```

---

## 11. Smoke 验收

新增脚本：

```text
scripts/smoke/project-assistant-loop.js
```

目标：

```text
1. 启动服务或连接已启动服务
2. 确认 project-assistant Agent 存在
3. 确认 project-assistant-digest workflow 可见
4. 执行 workflow
5. externalAgentSend 成功返回
6. event 被记录
7. project status 被更新
8. digest 被生成
9. 输出 PASS
```

验收命令：

```bash
npm run smoke:project-assistant
```

---

## 12. 本阶段不做

明确不做：

```text
PostgreSQL 适配
BullMQ + Redis
多 Agent A2A
CLI 任意命令执行
自动写代码
自动审代码
自动 push
自动 release
前端 UI
```

---

## 13. 完成标准

- [ ] 9 个 Tool 都有固定 Zod 输入契约。
- [ ] 9 个 Tool 输出都符合 `{ ok, data }`。
- [ ] `projectGenerateDigest` 支持 `format: markdown/json`，并包含最近 10 条 event。
- [ ] `externalAgentSend` 只支持白名单 profile。
- [ ] `externalAgentSend` 对 `reply/raw` 做长度截断。
- [ ] 项目状态、任务、事件、提醒可持久化。
- [ ] `external_agent_calls` 只作为内部审计日志，不暴露独立列表 Tool。
- [ ] `project-assistant-digest` workflow 可执行。
- [ ] smoke 脚本可一键跑通。
- [ ] `npm run lint` 0 error。
- [ ] `npm run format:check` 通过。
- [ ] `npm run test:coverage` 通过。
- [ ] `npm run audit:ci` 通过。
