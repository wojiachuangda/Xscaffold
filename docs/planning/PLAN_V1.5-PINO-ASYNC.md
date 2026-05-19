// [planner] ID: PLAN-V1.5-PINO-ASYNC | Date: 2026-05-20 | Description: V1.5 Pino 异步日志 transport（同步 SonicBoom → worker thread），等待 CONFIRM

# V1.5 实施计划 — Pino 异步日志

> 触发：V1.5 收尾两项之一（用户裁决「1」= Pino async）；`PERFORMANCE_REPORT.md:90` 已列入 V1.5
> 依据：RULES.md「大改动 → PLAN→CONFIRM」（命中条目：影响 logging / 启动流程 / 新增 env / 新增可观察行为变化）
> 目标：生产环境把 pino 写入路径从同步 SonicBoom 改为 worker thread 异步 transport，让日志 I/O 离开热路径

---

## 1. 当前现状分析

### 1.1 logger 装配（`src/observability/logger.js:32-58`）

```js
function createLogger(overrides) {
    const usePretty = env !== 'production' && env !== 'test';
    const options = { level, redact: { paths: REDACT_PATHS, ... }, ... };
    if (usePretty) {
        options.transport = { target: 'pino-pretty', options: { colorize: true, ... } };
    }
    return pino(options);  // ← 生产/测试走同步 SonicBoom 直写 fd=1
}
```

- 开发态：`pino-pretty` 是 worker（pino 内置行为）
- 测试态：`tests/setup.js` 设 `LOG_LEVEL=silent`，pino 在调用点短路（非 noop）
- 生产态：**同步 SonicBoom 直写 stdout**——本次目标改造点

### 1.2 调用面盘点

- 16 个文件 × 26 处 `logger.*` 调用；热路径：errorHandler / queue 入队 / IOOR 死信
- `redact.paths` 13 项白名单字段在主线程序列化阶段已 censor（无论是否启用 worker，都先于 transport 生效）

### 1.3 关键约束与文档现状

- **AA-SEAC §4.5 双脱敏管道**：存储前 `redactSensitive`（落库走的）+ pino `redact.paths`（日志走的），**两者分工不冗余**；worker transport 不破坏此分工
- **架构文档偏差**（`architecture.md:261` / `PRD.md:133`）声称「SSE 流式脱敏 = `apiGateway` SSE 拦截器」当前实际**未实现**（`apiGateway/` 无 `redactSensitive` 引用）。本期不补，PLAN 显式标注遗留
- `PLAN_P6.md:58` 历史提议 `LOG_PRETTY` 显式开关未落地——本期顺手补上

### 1.4 优雅停机的丢日志风险

`main.js:50-58 gracefulShutdown` 当前顺序 `HTTP → queue → ioorRecorder`，**未 await logger.flush**。同步 SonicBoom 时 Node `process.exit` 前自然 flush stdout，丢失窗口接近零；切到 worker 后，主线程→worker 的 MessagePort 队列里未投递的日志在 `SHUTDOWN_HARD_TIMEOUT_MS=10000` 触发 `process.exit(1)` 时**整批丢失**。

---

## 2. 修改范围评估

### 2.1 新建文件

| 路径 | 用途 |
|---|---|
| `src/observability/schemas/loggerConfigSchema.js` | Zod：`level / transport / pretty` |
| `docs/planning/PLAN_V1.5-PINO-ASYNC.md` | 本文件 |

### 2.2 改动现有文件

| 路径 | 改动 |
|---|---|
| `src/observability/logger.js` | `createLogger` 新增 transport 分支：`worker` 模式用 `pino.transport({ target: 'pino/file', options: { destination: 1, sync: false }})`；`sync` 保持现状；`auto`（默认）= 生产→worker / 其它→sync |
| `src/main.js` | `gracefulShutdown` 末尾追加 `await flushLogger()`（带 1-2s 超时兜底） |
| `.env.example` | 新增 `LOG_TRANSPORT=auto\|sync\|worker` + `LOG_PRETTY=auto\|on\|off` + bounded log loss window 风险提示 |
| `tests/unit/logger.test.js` | 新增 worker transport 配置可用性测试（destination 用临时文件，不污染 stdout） |
| `CHANGELOG.md` | `[1.8.0]` 段（含 Semantic Change：worker 模式下 bounded log loss window 诚实声明） |
| `package.json` | version bump |

**估算**：新建 2 文件，改动 ~5 文件，~150 行净改动。零业务逻辑改动，零新依赖（pino v9 内置 transport）。

### 2.3 关键实现要点

1. **transport 工厂**（生产默认）：
   ```js
   const transport = pino.transport({
       target: 'pino/file',
       options: { destination: 1, sync: false },  // 1 = stdout fd
   });
   return pino({ level, redact, formatters, timestamp }, transport);
   ```
2. **redact 保持在主 logger options**——worker 之前生效，脱敏不破
3. **flush helper**：
   ```js
   function flushLogger(timeoutMs = 2000) {
       return Promise.race([
           new Promise((resolve) => logger.flush(() => resolve())),
           new Promise((resolve) => setTimeout(resolve, timeoutMs)),
       ]);
   }
   ```
   超时兜底避免坏 transport 导致 shutdown 永等
4. **测试态保留 silent + sync**——避免 worker 在 jest 里残留 open handle；jest 已 `--forceExit`，但避免依赖
5. **`LOG_PRETTY=auto` 默认行为**与现状一致（非生产/非测试 → pretty），`on`/`off` 显式覆盖

---

## 3. 关键设计决策（待 CONFIRM）

| # | 决策 | 选项 | 我的建议 |
|---|---|---|---|
| D-PINO-1 | `LOG_TRANSPORT` 默认值 | (a) `auto`：production→worker，其它→sync (b) 总是 `worker` (c) 总是 `sync` 让运维显式开 | **(a)**：与 `LOG_PRETTY` 同 「按环境自动 + 可显式覆盖」 范式；生产开箱即享异步收益 |
| D-PINO-2 | `LOG_PRETTY` 显式开关一并落地 | (a) 是 (b) 否（继续 NODE_ENV 隐式判断） | **(a)**：`PLAN_P6.md:58` 历史遗留，0 成本顺手清；显式开关便于 prod debug |
| D-PINO-3 | shutdown 是否 await flush | (a) 是，带超时兜底 (b) 否，依赖 worker 自然退出 | **(a)**：worker queue 的 in-flight 日志在 process.exit 时一定丢；2s 超时兜底防坏 transport |
| D-PINO-4 | 是否本期补 SSE 流式脱敏 | (a) 否，本 PLAN 显式标注遗留 (b) 是 | **(a)**：用户「做完正好下班」节奏，SSE 脱敏属于另一块工作（要起 SSE 端点 + 拦截器）；本期只更新文档承认未实现 |
| D-PINO-5 | 版本号 | (a) `v1.7.1` patch (b) `v1.8.0` minor | **(b)**：引入新 env + 可观察行为变化（worker 下存在 bounded log loss window），不是纯 patch |
| D-PINO-6 | 测试期是否启用 worker | (a) 否，保持 sync + silent (b) 是 | **(a)**：jest worker thread 嵌套容易 open handle；测试期 silent 短路本就零代价 |
| D-PINO-7 | 是否修订 AA-SEAC | (a) 否，§4.5 双脱敏未变；只在 CHANGELOG 声明丢日志窗口 (b) 类比 IOOR §4.2 也加一条规范修订 | **(a)**：日志丢失不涉及 spec 条款；与 IOOR 「实时全量持久化」的硬约束不同；CHANGELOG + .env.example 风险提示即可 |

---

## 4. 预估可能破坏的已有业务

| 风险点 | 概率 | 缓解 |
|---|---|---|
| jest 测试出现 worker 残留句柄 | 中 | 测试期不启用 worker（D-PINO-6）；CI 现有 `--forceExit` 兜底 |
| worker transport 在 CI runner 上启动失败 | 低 | `LOG_TRANSPORT=sync` 一行可回滚；CI 启动后看 `lint-and-test` job 日志确认 worker 起来 |
| `pino-pretty` 与 worker 二选一被混淆 | 低 | `usePretty` 与 `useWorker` 是互斥分支，明确 if/else |
| 生产日志格式因 transport 切换变化（多/少了字段） | 低 | `pino/file` target 是 pino 原生 ndjson 输出，等价同步路径；single unit test 跑一条日志做正则断言 |
| `logger.flush(cb)` 在某些 pino 版本签名变化 | 低 | 锁 `pino@^9.4`；查 v9 API 仍是 `logger.flush(cb)` |
| 主线程崩溃前未投递的日志窗口丢失 | **中** | bounded log loss window 写入 CHANGELOG + .env.example；超时 flush 已兜底正常 shutdown |

---

## 5. 验收标准（DoD）

- [ ] 默认 `auto`：开发 = pretty + sync；测试 = sync + silent；生产 = worker（ndjson 异步写 stdout）
- [ ] `LOG_TRANSPORT=sync` 强制同步（回滚开关）
- [ ] `LOG_PRETTY=on/off` 强制覆盖按环境推断
- [ ] `main.js gracefulShutdown` 调用 `flushLogger()` 带 ≤2s 超时
- [ ] `redact.paths` 在 worker 模式下仍生效（单测覆盖：触发 password 字段，断言输出含 `[REDACTED]`）
- [ ] CHANGELOG `[1.8.0]` 含「bounded log loss window」诚实声明
- [ ] `npm run lint` 0 error；覆盖率不降
- [ ] CI 五个 job 全绿（lint-and-test 顺便覆盖 worker 模式启动）

---

## 6. 阶段产出与 commit

V1.5-PINO-ASYNC 单实现 pass，2 commit：

1. `feat(observability): Pino worker thread transport + LOG_TRANSPORT/LOG_PRETTY (V1.5)`
2. `chore(release): pino async logging v1.8.0`

**发布门禁**：不引入新外部服务，CI 用现有 5 job 验收；tag 等 CI 绿。

---

## 7. 附加问题

1. **SPEC 阶段产物**：新 Zod 契约 `LoggerConfigSchema`（level/transport/pretty 三字段）。SPEC 是否就只交付这一处契约后进 CODE？（建议：是）
2. **CHANGELOG 是否单独加 Semantic Change 子段**（类比 v1.7.0 IOOR）声明 bounded log loss window？（建议：是）
3. **本期是否同时把 logger.js 改成 state + 模块级函数风格**（IOOR/pgDriver 一致）？（建议：**否**——logger.js 当前 70 行不到，未达 lint 阈值；改风格无收益，保 scope）
4. **SSE 流式脱敏遗留如何处理**：(a) 在 PLAN 与 CHANGELOG 标注「未实现，下个版本独立做」 (b) 修订 `architecture.md` 删掉那行 (c) 同时加 `SECURITY_AUDIT` 一条 INFO 项 — 建议 **(a)+(c)**

---

## 8. 一句话总结

V1.5-PINO-ASYNC 把生产日志写入从同步 SonicBoom 改为 pino v9 内置 worker thread transport，让日志 I/O 离开热路径；并把 `LOG_TRANSPORT` / `LOG_PRETTY` 双显式开关一并落地，顺手补 `PLAN_P6` 历史欠账。零 REST API 改动、零业务逻辑改动；唯一可观察的语义变化是「worker 模式下非受控崩溃存在 bounded log loss window」，需诚实声明。

**请回复 CONFIRM（可附 D-PINO-1~7 + 附加问题 1~4 的调整）后进入 SPEC/CODE。**
