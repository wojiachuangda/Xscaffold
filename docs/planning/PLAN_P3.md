// [planner] ID: PLAN-P3 | Date: 2026-05-18 | Description: P3 阶段（配置与扩展）实施前的现状/范围/风险评估，等待 CONFIRM

# P3 实施计划 — configManager + 插件机制

> 触发：RULES.md §阶段 1（PLAN-First），需获 CONFIRM 后进入 SPEC/CODE。

---

## 1. 当前现状分析

### 1.1 已有能力（P0–P2 完成）
- 配置以 **JS 对象**形式传入 `workflowExecutor.execute(workflowDef)`，由 `WorkflowSchema` Zod 校验后执行（见 `src/workflowEngine/workflowSchema.js`）。
- 工具通过 `createRegistry()` + `registerBuiltins()` 在内存中注册（见 `src/toolRegistry/builtinTools/index.js`），**尚无文件系统插件加载机制**。
- 环境变量驱动（`PORT/DATABASE_URL/MAX_WORKFLOW_TIMEOUT_MS` 等），由 `dotenv` 加载，无 YAML/JSON 工作流文件持久化能力。

### 1.2 缺口（P3 待补）
| 缺口 | 影响 |
|------|------|
| 无法从 `.yaml/.yml/.json` 文件加载工作流 | PRD US-02（业务架构师写 YAML）无法实现 |
| 无配置热加载 | 改配置需重启服务 |
| 无插件目录扫描 | 第三方工具集成需改核心代码 |
| 无配置 `ref` 嵌套（子工作流引用） | 大流程无法模块化拆分 |

### 1.3 与开发文档/任务拆解的对齐
- 任务拆解 `task_list.md` 阶段 P3 共 5 个任务：T3.1–T3.5。
- 开发文档 §4.3 / §4.4 已定义 `configLoader` 与 `pluginLoader` 接口。

---

## 2. 修改范围评估

### 2.1 新建文件
| 路径 | 用途 | 来源任务 |
|------|------|---------|
| `src/configManager/configSchema.js` | YAML/JSON 顶层 Schema（含 ref 引用） | T3.1 |
| `src/configManager/configLoader.js` | `loadFromFile` / `validateSchema` / `toWorkflowDef` | T3.2 |
| `src/configManager/configWatcher.js` | chokidar 文件变更监听 | T3.3 |
| `src/toolRegistry/pluginLoader.js` | 扫描 `./plugins/` 目录、动态 require、安全包装 | T3.4 |
| `plugins/exampleTool/index.js` | 示例插件（演示扩展协议） | T3.4 |
| `plugins/exampleTool/package.json` | 插件元数据 | T3.4 |
| `tests/unit/configSchema.test.js` | Schema 单元测试 | T3.1 |
| `tests/unit/configLoader.test.js` | YAML/JSON 解析单元测试 | T3.2 |
| `tests/unit/configWatcher.test.js` | 文件变更回调测试 | T3.3 |
| `tests/unit/pluginLoader.test.js` | 插件扫描与加载测试 | T3.4 |
| `tests/e2e/yamlWorkflow.e2e.test.js` | YAML → executor 端到端 | T3.5 |
| `tests/fixtures/workflows/*.yaml` | 测试 YAML fixtures | T3.5 |
| `tests/fixtures/plugins/*` | 测试用插件 fixtures | T3.4 |

### 2.2 改动现有文件
| 路径 | 改动点 | 风险 |
|------|--------|------|
| `package.json` | 新增依赖：`js-yaml@^4.1`, `chokidar@^4.0` | 仅 runtime 依赖，无破坏 |
| `src/toolRegistry/builtinTools/index.js` | `registerBuiltins` 可选合并 `registerPlugins` 调用点 | 低；保持向后兼容 |
| 不动 `agentManager` / `workflowEngine` / `apiGateway` | — | 0 |

### 2.3 与 RULES.md §阶段 2 的冲突

> RULES.md §阶段 2：契约必须存放在 `src/domain/{domain_name}/schemas/`。

- **现状**：P0-P2 Schema 散布在各模块目录（`agentManager/agentSchema.js`、`workflowEngine/workflowSchema.js`、`toolRegistry/toolSchema.js`），与 `architecture.md` §5 目录设计一致。
- **冲突点**：本阶段新增 `configSchema.js` 若放 `src/domain/config/schemas/` 会引入两套结构并存。
- **建议方案**（候选）：
  - **方案 A**：P3 起严格按 RULES.md，新 Schema 放 `src/domain/config/schemas/`；P4 启动前单独提一个 `refactor` PR 将旧 Schema 迁移到 `src/domain/`。
  - **方案 B**：维持 `architecture.md` 结构，P3 把 `configSchema.js` 放 `src/configManager/`；同时更新 RULES.md 第 2 段描述以匹配实际结构。
  - **方案 C**：本阶段维持旧结构落地交付，迁移与 RULES 调整在 **P3 完成后**单独开 PLAN 评估。
- **倾向**：方案 C — 不打散 P3 任务焦点，重构作为独立工作项处置。

---

## 3. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解措施 |
|--------|------|---------|
| `js-yaml` 解析非法 YAML 抛 native error，未走 AppError 体系 | 高 | configLoader 内统一包装为 `ValidationError`，details 透传 yaml 行号 |
| 插件加载时 `require()` 抛错可能让进程崩溃 | 中 | try/catch 包装单插件，失败记 `logger.error` 并跳过，**不阻塞主流程** |
| 插件可任意访问 fs/network 引发安全风险 | 中 | MVP 阶段仅日志告警；V2 引入 `isolated-vm` 沙箱（写入 V2 路线） |
| chokidar 在 Windows 上可能持有句柄导致测试 flake | 中 | 测试中显式 `.close()`；CI 加上 timeout |
| `ref` 引用支持嵌套子工作流可能形成循环 | 低 | configLoader 解析时维护 visited 集合，循环 ref → `ValidationError` |
| 配置热加载与工作流运行中并发 → 旧 def 仍在执行 | 低 | configManager 内部使用版本号；executor 复制 def 后执行 |

---

## 4. 实施顺序与里程碑

```
T3.1 configSchema   ──┐
                      ├─> T3.2 configLoader ──┐
                      │                       ├─> T3.5 E2E (YAML → executor)
T2.x workflowSchema ──┘                       │
                                              │
T3.3 configWatcher  ──────────────────────────┤
                                              │
T3.4 pluginLoader ────────────────────────────┘
              ▲
              └── toolRegistry (P2 已有)
```

里程碑：
- **M3.A**：T3.1 + T3.2 完成 → YAML 加载到 workflowDef 全打通
- **M3.B**：T3.3 + T3.4 完成 → 热加载与插件机制就绪
- **M3.C**：T3.5 E2E 通过 → P3 收尾

---

## 5. 验收标准（DoD）

- [ ] `WorkflowSchema` 对 YAML 解析后的对象同样 100% 通过
- [ ] 缺字段/类型错误的 YAML 抛 `ValidationError`，details 含 yaml 路径
- [ ] 修改 `tests/fixtures/workflows/x.yaml` → watcher 触发 → 加载结果与新文件一致
- [ ] `./plugins/exampleTool/` 启动时被自动加载并可在工作流中调用
- [ ] 单插件加载失败不阻塞其他插件
- [ ] 整体覆盖率维持 ≥ 80%（branch ≥ 80%）
- [ ] `npm run lint` 0 error；所有新文件含 AA-SEAC 头注释

---

## 6. 待 CONFIRM 的决策点

1. **Schema 目录结构**：方案 A / B / **C（推荐）** ？
2. **`ref` 子工作流引用**：MVP 是否支持？建议 **延后到 V1**，本阶段仅校验语法、不解引用。
3. **插件协议**：是否要求每个插件目录必须有 `package.json`（`main` 字段指向入口）？建议 **是**，便于 V2 走 npm 包安装。
4. **YAML/JSON 共存**：是否同时支持 `.yaml/.yml/.json`？建议 **是**，loader 按扩展名分派。
5. **示例插件功能**：建议实现一个 `reverseString` 工具用于演示。是否同意？

---

**请回复 CONFIRM（可附上对决策点 1–5 的取舍）后我进入 SPEC 阶段。**
