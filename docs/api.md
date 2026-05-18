// [docs] ID: API-001 | Date: 2026-05-18 | Description: REST API 参考（v1.0.0）

# REST API 参考 (v1.0.0)

> Base URL：`http://<host>:<port>`（默认 `http://localhost:3000`）
> 鉴权：除明确豁免端点外，所有路由需 `Authorization: Bearer <jwt>` 头

---

## 0. 通用响应契约

所有响应（含错误）均为：
```json
{
  "success": true | false,
  "data":    <object | array | null>,
  "error":   { "code": "...", "message": "...", "details": ... } | null,
  "meta":    { "total": 100, "limit": 50, "offset": 0 }   // 仅列表
}
```

### HTTP 状态码
| 码 | 语义 |
|----|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 202 | 已入队，异步执行中 |
| 400 | `VALIDATION_ERROR` — 入参不合法（含 Zod issues） |
| 401 | `UNAUTHORIZED` — JWT 缺失/过期/无效，或 webhook 签名错 |
| 403 | `FORBIDDEN` — 无权限 |
| 404 | `NOT_FOUND` — 资源不存在 |
| 409 | `CONFLICT` — 唯一约束冲突 |
| 429 | `RATE_LIMIT` — 超限（带 `Retry-After` 头） |
| 500 | `INTERNAL_ERROR` — 服务器错误 |
| 504 | `TIMEOUT` — 工作流/节点超时 |

---

## 1. 健康检查（豁免鉴权）

### `GET /healthz`
**Liveness probe**。返回 200 表示进程存活。
```json
{ "success": true, "data": { "status": "ok", "uptime": 123.45 }, "error": null }
```

### `GET /readyz`
**Readiness probe**。检查 DB + 队列连通性。
```json
{ "success": true, "data": { "status": "ready", "checks": { "db": true, "queue": true } }, "error": null }
```
不就绪时返回 503。

### `GET /metrics`
**Prometheus 文本格式**。默认匿名可访问；设置 `METRICS_TOKEN` 后需 `x-metrics-token` 头。
```
# TYPE workflow_duration_ms histogram
workflow_duration_ms_bucket{workflow="x",status="SUCCESS",le="100"} 5
...
```

---

## 2. Agent 管理

### `POST /agents`
创建 Agent。

**请求体**：
```json
{
  "name": "planner",
  "description": "规划师",
  "model": "gpt-4",
  "tools": ["addNumbers", "httpRequest"],
  "status": "enabled"
}
```
- `name`：1–128 字符，仅字母/数字/下划线/中划线/点/空格
- `model`：必填
- `tools`：可选，工具名数组
- `status`：`enabled` (默认) / `disabled`

**响应** 201：
```json
{
  "success": true,
  "data": { "id": "agent_a1b2c3d4...", "name": "planner", "createdAt": "2026-05-18T...", ... },
  "error": null
}
```

### `GET /agents`
列出 Agent，支持过滤与分页。
**Query**：`status=enabled` `name=部分关键字` `limit=50` `offset=0`

### `GET /agents/:id`
获取单个 Agent。404 if 不存在。

### `PUT /agents/:id`
更新 Agent。请求体至少含一个字段；不可改 `id`。

### `DELETE /agents/:id`
删除 Agent。

---

## 3. 工作流执行

### `GET /workflows`
列出已注册工作流。
```json
{
  "success": true,
  "data": [{ "id": "math-pipeline", "name": "math-pipeline", "version": "1.0", "nodeCount": 2 }],
  "error": null
}
```

### `POST /workflows/:id/execute`
异步触发工作流。

**请求体**：
```json
{ "input": { "key1": "value1" } }
```

**响应** 202：
```json
{
  "success": true,
  "data": {
    "id": "exec_a1b2c3...",
    "workflowId": "math-pipeline",
    "status": "PENDING",
    "startedAt": "2026-05-18T...",
    ...
  },
  "error": null
}
```

### `GET /workflows/executions/:id`
查询执行状态。

**响应**：
```json
{
  "success": true,
  "data": {
    "id": "exec_a1b2c3...",
    "workflowId": "math-pipeline",
    "status": "SUCCESS",                  // PENDING/RUNNING/SUCCESS/FAILED/STUCK/TIMEOUT
    "input": { "key1": "value1" },
    "result": { "sum": { "result": 30 }, "double": { "result": 60 } },
    "error": null,
    "startedAt": "...",
    "finishedAt": "...",
    "durationMs": 23
  },
  "error": null
}
```

### `GET /workflows/executions/:id/trace`
查询完整 trace（含 IOOR）。

**响应**：
```json
{
  "success": true,
  "data": {
    "executionId": "exec_a1b2c3...",
    "spans": [
      { "id": "trace_...", "nodeId": "sum", "nodeType": "tool", "status": "SUCCESS", "durationMs": 5 }
    ],
    "ioor": [
      {
        "id": "ioor_...",
        "agentId": "agent_...",
        "profileHash": "<64-char hex>",
        "modelName": "gpt-4",
        "input": { "messages": [...] },
        "output": { "content": "...", "reasoning_content": "..." },
        "tokenUsage": { "prompt": 10, "completion": 5, "total": 15, "cached_prompt_tokens": 0 },
        "latencyMs": 120
      }
    ]
  },
  "error": null
}
```

---

## 4. Webhook（豁免 JWT，需签名）

### `POST /webhooks/github`
接收 GitHub Webhook 触发预绑定的工作流。

**请求头**：
- `x-hub-signature-256: sha256=<hmac>`（必填，HMAC-SHA256 of raw body using `WEBHOOK_SECRET`）
- `x-webhook-timestamp: <ms>`（可选，±5min 防重放）
- `content-type: application/octet-stream`（推荐，让 raw body parser 接管）

**响应** 202：
```json
{ "success": true, "data": { "executionId": "exec_..." }, "error": null }
```

**错误**：
- 401 `UNAUTHORIZED` — 签名缺失/错误/时间窗口超出
- 404 `NOT_FOUND` — 绑定的 workflowId 未注册

---

## 5. 错误响应示例

### 400 ValidationError
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数不合法",
    "details": [
      { "path": "name", "code": "invalid_type", "message": "Required", "location": "body" }
    ]
  }
}
```

### 401 AuthError
```json
{ "success": false, "data": null, "error": { "code": "UNAUTHORIZED", "message": "令牌已过期" } }
```

### 429 RateLimitError
```json
{ "success": false, "data": null, "error": { "code": "RATE_LIMIT", "message": "请求过于频繁，请 30s 后重试" } }
```
响应头：`Retry-After: 30`

---

## 6. JWT 生成（开发期）

```js
const jwt = require('jsonwebtoken');
const token = jwt.sign({ sub: 'user-1', role: 'admin' }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
});
```

或使用项目的测试工具：
```js
const { signTestToken } = require('./src/apiGateway/middlewares/authMiddleware');
const token = signTestToken({ sub: 'u1' }, 'your-secret');
```

---

## 7. 限流

默认按 IP（或登录用户 `sub`）每分钟 60 次。可通过 `RATE_LIMIT_PER_MINUTE` 调整。
- `/healthz`、`/readyz`、`/metrics`、`/webhooks/*` **不参与** JWT 鉴权，但**仍会**经过限流（除非启动时 `rateLimitBypass=true`）
