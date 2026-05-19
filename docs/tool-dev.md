// [docs] ID: TOOL-DEV-001 | Date: 2026-05-19 | Description: Tool 开发参数结构与规范约束

# Tool 开发规范

> 本文定义 Xscaffold 中 Tool 的固定结构、参数契约、输出约定与安全边界。  
> 插件目录如何加载请看 `docs/plugin-dev.md`；本文只关心“一个工具应该怎么写”。

---

## 1. Tool 是什么

Tool 是 Agent 或 Workflow 可以调用的一个受控能力。

在代码里，一个 Tool 是一个对象：

```js
{
    name: 'project.getStatus',
    description: '读取项目当前状态',
    paramsSchema: z.object({ ... }).strict(),
    handler: async (params, context) => {
        return { result: ... };
    },
    timeoutMs: 5000,
}
```

平台会在调用前做这些事：

1. 按 `name` 找到工具。
2. 用 `paramsSchema` 校验输入参数。
3. 校验通过后调用 `handler(params, context)`。
4. 超过 `timeoutMs` 或默认超时时间则失败。

---

## 2. 固定 Tool 结构

每个 Tool 必须包含：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `name` | 是 | 全局唯一工具名 |
| `description` | 否 | 给 Agent/开发者看的简短说明 |
| `paramsSchema` | 是 | Zod 输入参数契约 |
| `handler` | 是 | 实际执行函数，必须返回 Promise 或 async 函数 |
| `timeoutMs` | 否 | 单次调用超时时间 |

当前源码契约位于：

```text
src/toolRegistry/toolSchema.js
```

工具名规则：

```text
1. 1-64 字符
2. 必须以字母开头
3. 只允许字母、数字、下划线、中划线
```

注意：当前代码层正则暂不允许点号 `.`。如果要使用 `project.getStatus` 这种分组命名，需要先调整 `ToolDefSchema.name` 的正则。未调整前建议用：

```text
projectGetStatus
projectUpdateStatus
taskUpsert
eventRecord
reminderCreate
cliRun
```

---

## 3. 输入参数规范

Tool 输入必须固定，由 `paramsSchema` 定义。

推荐：

```js
paramsSchema: z
    .object({
        projectId: z.string().min(1).max(128),
        status: z.enum(['active', 'paused', 'done', 'blocked']).optional(),
    })
    .strict()
```

约束：

1. 必须使用 Zod。
2. 对象 schema 必须 `.strict()`。
3. 字符串必须设置 `min/max`。
4. 数字必须设置范围。
5. 枚举字段必须用 `z.enum(...)`。
6. 时间字段统一使用 ISO 字符串。
7. 路径、命令、URL 这类高风险字段必须有白名单或限制。

不要写：

```js
paramsSchema: z.any()
```

不要让输入形态漂移：

```js
// 不推荐：有时是字符串，有时是对象
handler: async (params) => ...
```

---

## 4. 输出结构规范

当前平台没有强制输出 schema，但工程上必须固定输出结构。

推荐所有 Tool 返回：

```js
return {
    ok: true,
    data: {},
};
```

失败不要返回 `{ ok: false }` 当作正常结果，应该直接抛错：

```js
throw new Error('项目不存在');
```

推荐输出约定：

| 场景 | 输出 |
|---|---|
| 查询类 | `{ ok: true, data: {...} }` |
| 列表类 | `{ ok: true, data: { items: [...], total: 0 } }` |
| 写入类 | `{ ok: true, data: { id, updatedAt } }` |
| 执行类 | `{ ok: true, data: { exitCode, stdout, stderr, summary } }` |

不要一会儿返回字符串，一会儿返回对象。Workflow 下游会引用字段，输出漂移会导致下游坏掉。

---

## 5. Handler 规范

`handler` 签名固定：

```js
handler: async (params, context) => {
    return { ok: true, data: {} };
}
```

`params`：

```text
已通过 paramsSchema 校验的输入参数。
```

`context`：

```text
运行时上下文，可能包含 executionId、sessionId、db 等。
```

约束：

1. `handler` 必须可重入，不依赖全局可变状态。
2. 不要在 `register()` 阶段执行业务逻辑。
3. 不要吞异常。
4. 网络、文件、CLI 调用必须设置超时。
5. 不要直接输出密钥、token、密码等敏感信息。
6. 不要在循环里做大量 DB 查询或网络请求。

---

## 6. 错误处理规范

推荐直接抛错：

```js
throw new Error('projectId 不存在');
```

平台会把错误交给工作流执行器和全局错误处理链路。

如需结构化错误，优先使用项目内错误类：

```js
const { ValidationError, NotFoundError } = require('../src/infrastructure/errors/AppError');
```

常见错误类型：

| 类型 | 使用场景 |
|---|---|
| `ValidationError` | 参数语义不合法 |
| `NotFoundError` | 目标不存在 |
| `ForbiddenError` | 权限不足 |
| `TimeoutError` | 外部调用超时 |

---

## 7. 安全约束

### 7.1 CLI Tool 必须白名单

如果实现 `cliRun`，不能让 Agent 执行任意命令。

推荐第一版只允许：

```text
git status --short
git log --oneline -n 10
npm run lint
npm run format:check
npm run test:coverage
npm run audit:ci
```

`cliRun` 输入示例：

```json
{
  "projectId": "xscaffold",
  "command": "npm run test:coverage",
  "cwd": "D:\\03_code\\01_project\\Xscaffold",
  "timeoutMs": 120000
}
```

必须限制：

1. `command` 必须命中白名单。
2. `cwd` 必须在允许的项目根目录内。
3. 禁止 `rm`、`del`、`Remove-Item`、`git reset --hard` 等破坏性命令。
4. 禁止 shell 拼接任意用户输入。
5. stdout/stderr 要截断，避免超大输出。

### 7.2 HTTP Tool 必须防 SSRF

HTTP 请求类 Tool 必须使用已有 `httpRequest` 或复用 `httpGuard`。

必须限制：

1. 只允许 `http/https`。
2. 默认拒绝内网 IP、localhost、云元数据地址。
3. 支持 allowed hosts 白名单。
4. 超时必须明确。

### 7.3 文件 Tool 必须限制目录

读写文件类 Tool 必须限制在项目根目录或明确允许目录内。

不要允许：

```text
C:\Users\...
/etc/...
任意绝对路径
```

---

## 8. 命名规范

如果当前代码未调整点号命名，使用 camelCase：

```text
projectGetStatus
projectUpdateStatus
taskList
taskUpsert
eventRecord
reminderCreate
reminderListDue
cliRun
projectGenerateDigest
```

如果后续调整 `ToolDefSchema.name` 允许点号，推荐分组命名：

```text
project.getStatus
project.updateStatus
task.list
task.upsert
event.record
reminder.create
reminder.listDue
cli.run
project.generateDigest
```

命名原则：

1. 查询用 `get/list`。
2. 写入用 `create/update/upsert/delete`。
3. 记录事件用 `record`。
4. 执行动作用 `run/execute`。
5. 不使用缩写，如 `updProj`、`sendMsg`。

---

## 9. 项目助理第一版固定 Tool 清单

你的第一版项目助理只做项目跟踪、提醒、状态同步、调用外部 CLI，不做代码开发和代码审核。

固定 Tool 清单：

| Tool | 目的 |
|---|---|
| `projectGetStatus` | 读取项目状态 |
| `projectUpdateStatus` | 更新项目状态 |
| `taskList` | 列出任务 |
| `taskUpsert` | 创建或更新任务 |
| `eventRecord` | 记录重要事件 |
| `reminderCreate` | 创建提醒 |
| `reminderListDue` | 查询到期提醒 |
| `cliRun` | 执行白名单 CLI 命令 |
| `projectGenerateDigest` | 生成日报/状态摘要 |

第一版不要做：

```text
自动写代码
自动审代码
自动 push
自动 release
任意命令执行
多 Agent 复杂 A2A
```

---

## 10. 第一版参数结构

### 10.1 projectGetStatus

输入：

```json
{
  "projectId": "xscaffold"
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "projectId": "xscaffold",
    "name": "Xscaffold",
    "phase": "A.1",
    "status": "active",
    "health": "green",
    "completion": 76,
    "summary": "A.1 async repository contract 已完成，CI 全绿。",
    "updatedAt": "2026-05-19T00:00:00.000Z"
  }
}
```

### 10.2 projectUpdateStatus

输入：

```json
{
  "projectId": "xscaffold",
  "phase": "A.1",
  "status": "active",
  "health": "green",
  "completion": 76,
  "summary": "A.1 已完成，下一步封口 Agent 闭环。"
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "projectId": "xscaffold",
    "updatedAt": "2026-05-19T00:00:00.000Z"
  }
}
```

### 10.3 taskUpsert

输入：

```json
{
  "projectId": "xscaffold",
  "taskId": "agent-loop-demo",
  "title": "实现 Agent 闭环 demo",
  "status": "open",
  "priority": "high",
  "notes": "需要 workflow 自动加载和 smoke 脚本。"
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "taskId": "agent-loop-demo",
    "updatedAt": "2026-05-19T00:00:00.000Z"
  }
}
```

### 10.4 taskList

输入：

```json
{
  "projectId": "xscaffold",
  "status": "open"
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "taskId": "agent-loop-demo",
        "title": "实现 Agent 闭环 demo",
        "status": "open",
        "priority": "high"
      }
    ],
    "total": 1
  }
}
```

### 10.5 eventRecord

输入：

```json
{
  "projectId": "xscaffold",
  "type": "ci_passed",
  "title": "CI 全绿",
  "content": "A.1 修复后 GitHub Actions 全部通过。",
  "importance": "high"
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "eventId": "event_xxx",
    "createdAt": "2026-05-19T00:00:00.000Z"
  }
}
```

### 10.6 reminderCreate

输入：

```json
{
  "projectId": "xscaffold",
  "title": "检查 Agent 闭环 smoke",
  "content": "确认 math-demo workflow 能执行成功。",
  "dueAt": "2026-05-20T09:00:00+08:00",
  "level": "normal"
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "reminderId": "reminder_xxx"
  }
}
```

### 10.7 reminderListDue

输入：

```json
{
  "before": "2026-05-20T10:00:00+08:00"
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 0
  }
}
```

### 10.8 cliRun

输入：

```json
{
  "projectId": "xscaffold",
  "command": "npm run test:coverage",
  "cwd": "D:\\03_code\\01_project\\Xscaffold",
  "timeoutMs": 120000
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "exitCode": 0,
    "stdout": "...",
    "stderr": "",
    "summary": "44 suites / 374 tests passed"
  }
}
```

### 10.9 projectGenerateDigest

输入：

```json
{
  "projectId": "xscaffold",
  "range": "daily",
  "format": "markdown"
}
```

输出：

```json
{
  "ok": true,
  "data": {
    "digest": "## Xscaffold 状态\n- CI 全绿\n- 下一步：Agent 闭环封口"
  }
}
```

---

## 11. Tool 模板

```js
// [plugin] ID: TOOL-001 | Date: 2026-05-19 | Description: 示例 Tool
'use strict';

const { z } = require('zod');

const projectGetStatus = {
    name: 'projectGetStatus',
    description: '读取项目当前状态',
    paramsSchema: z
        .object({
            projectId: z.string().min(1).max(128),
        })
        .strict(),
    // handler 体内如果暂时无 I/O，仍保持 async 以契合 Tool 接口。
    // eslint-disable-next-line require-await
    handler: async ({ projectId }) => ({
        ok: true,
        data: {
            projectId,
            status: 'active',
            health: 'green',
            completion: 0,
        },
    }),
    timeoutMs: 5000,
};

function register(toolRegistry) {
    toolRegistry.register(projectGetStatus);
}

module.exports = { register, projectGetStatus };
```

---

## 12. 验收清单

新增 Tool 必须满足：

- [ ] `name` 全局唯一，并符合当前 `ToolDefSchema`。
- [ ] `paramsSchema` 使用 Zod 且 `.strict()`。
- [ ] 输入字段都有长度、范围或枚举约束。
- [ ] 输出结构固定，推荐 `{ ok, data }`。
- [ ] 失败通过抛错表达，不用 `{ ok: false }` 冒充成功。
- [ ] 有 `timeoutMs` 或确认默认超时足够。
- [ ] 不泄漏密钥、token、密码。
- [ ] CLI/HTTP/文件类 Tool 有白名单或边界限制。
- [ ] 有单元测试覆盖成功路径和非法参数路径。
- [ ] 可在 Workflow `tool` 节点中通过 `toolName` 调用。
