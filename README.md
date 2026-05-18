# Agentic App Platform

> 声明式（YAML/JSON）智能应用编排平台。通过配置而非代码快速搭建、部署、运行具备自主决策能力的 Agent 应用。

[![tests](https://img.shields.io/badge/tests-328%20passing-brightgreen)]()
[![coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)]()
[![node](https://img.shields.io/badge/node-%3E%3D20-blue)]()
[![version](https://img.shields.io/badge/version-1.0.0-blue)]()

---

## ✨ 核心能力

| 模块 | 能力 |
|------|------|
| **Agent 管理** | REST CRUD，Zod 强校验，状态机隔离 |
| **工作流编排** | DAG 拓扑执行，条件分支，节点级超时/重试 |
| **配置驱动** | YAML/JSON 加载 + 热更新（chokidar 监听） |
| **工具与插件** | 5 个内置工具 + `plugins/` 目录自动扫描 |
| **多轮记忆** | sessionId 维度的对话历史，自动注入 LLM |
| **可观测性** | IOOR 全量记录 + node trace + Prometheus metrics |
| **接入层** | JWT 认证 + 限流 + Webhook 签名 + 异步队列 |
| **有界自愈** | LLM 契约失败重投喂 ≤2 次，超限锁 STUCK |
| **安全** | 双重脱敏（存储/日志）+ HMAC-SHA256 + timing-safe 比对 |

---

## 🚀 30 分钟快速开始

### 前置条件
- Node.js ≥ 20
- npm（项目使用 commonjs 模块）

### 1) 安装依赖
```bash
git clone <repo> && cd Xscaffold
npm install
```

### 2) 配置环境
```bash
cp .env.example .env
# 编辑 .env，至少设置 JWT_SECRET
```

### 3) 数据库迁移
```bash
npm run migrate
```

### 4) 启动开发服务
```bash
npm run dev
```

服务监听 `http://localhost:3000`。

### 5) 验证
```bash
# 健康检查
curl http://localhost:3000/healthz

# 拉取 metrics
curl http://localhost:3000/metrics

# 创建 Agent（需先生成 JWT，参考 docs/api.md）
curl -X POST http://localhost:3000/agents \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"planner","model":"gpt-4","tools":["addNumbers"]}'
```

---

## 📁 项目结构

```
src/
├── apiGateway/          # 接入层（路由、中间件、控制器）
│   ├── controllers/     # workflow / webhook / observability
│   └── middlewares/     # auth / rateLimit / validate / errorHandler
├── agentManager/        # Agent CRUD
├── workflowEngine/      # 编排引擎（executor / nodeRunner / stateMachine / selfHealing）
├── configManager/       # YAML/JSON 解析与热加载
├── toolRegistry/        # 工具注册中心 + 内置工具
│   └── builtinTools/    # httpRequest / queryDatabase / readFile / addNumbers / sendEmail
├── memoryManager/       # 多轮对话记忆
├── observability/       # IOOR / trace / metrics / 脱敏
├── domain/audit/        # 审计降级通道
└── infrastructure/      # DB / 队列 / LLM / 错误类
```

详见 `docs/planning/architecture.md`。

---

## 📚 文档导航

| 文档 | 用途 |
|------|------|
| [开发文档](docs/开发文档.md) | 项目原始 spec |
| [PRD](docs/planning/PRD.md) | 产品需求文档 |
| [架构](docs/planning/architecture.md) | 系统架构 + 目录设计 + AA-SEAC 映射 |
| [任务拆解](docs/planning/task_list.md) | 6 阶段 43 任务清单 |
| [API 参考](docs/api.md) | 完整 REST 端点 |
| [插件开发](docs/plugin-dev.md) | 第三方工具集成 |
| [安全审计](docs/security/SECURITY_AUDIT.md) | OWASP Top 10 + AA-SEAC 合规 |
| [性能报告](docs/performance/PERFORMANCE_REPORT.md) | 压测基线 |
| [开发规范](.claude/rules/AA-SEAC-Specification.md) | AA-SEAC 工程规范 |
| [CHANGELOG](CHANGELOG.md) | 版本历史 |

---

## 🧪 开发命令

```bash
npm test                  # 跑全部测试
npm run test:coverage     # 含覆盖率报告
npm run lint              # ESLint 校验
npm run lint:fix          # 自动修复
npm run format            # Prettier 格式化
npm run bench             # 性能压测
```

---

## 🛡 安全须知

- **JWT_SECRET**：生产必须替换 `.env.example` 中的占位值，强度 ≥ 32 字符随机串
- **METRICS_TOKEN**：建议在生产启用，防止 `/metrics` 匿名拉取
- **HTTP_REQUEST_ALLOWED_HOSTS**：v1.0.0 已知限制 — `httpRequest` 工具无内置 SSRF 白名单，运维侧需配置网络隔离（V1.1 代码层修复）
- **插件信任边界**：MVP 阶段 `plugins/` 内插件以进程权限运行；V2 引入 sandbox

详见 [SECURITY_AUDIT.md](docs/security/SECURITY_AUDIT.md)。

---

## 🔧 技术栈

| 类别 | 选型 |
|------|------|
| 运行时 | Node.js 20+ |
| HTTP | Express 4 |
| 校验 | Zod |
| DB | SQLite (better-sqlite3) → PG 平滑迁移 |
| 队列 | 内存队列（MVP）→ BullMQ + Redis（V1.5） |
| 日志 | Pino + 字段级脱敏 |
| 测试 | Jest + Supertest |
| 性能 | autocannon |

---

## 📦 版本

当前：**v1.0.0** (2026-05-18) — 见 [CHANGELOG](CHANGELOG.md)
