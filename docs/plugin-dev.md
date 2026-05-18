// [docs] ID: PLUGIN-DEV-001 | Date: 2026-05-19 | Description: 第三方工具插件开发指南

# 插件开发指南

> 通过插件机制为平台扩展自定义工具，**无需修改核心代码**。

---

## 1. 插件协议

每个插件是 `plugins/<name>/` 下的一个目录，必须包含：

### `package.json`
```json
{
  "name": "your-plugin-name",
  "version": "1.0.0",
  "main": "index.js"
}
```
- `name`：唯一标识符（不必与目录名一致）
- `main`：入口 JS 文件路径（相对插件目录）

### `index.js`
必须导出 `register(toolRegistry)` 函数：
```js
'use strict';
const { z } = require('zod');

const myTool = {
    name: 'myTool',                          // 唯一工具名（全局命名空间）
    description: '工具描述',
    paramsSchema: z.object({                 // Zod schema，调用前自动校验
        input: z.string(),
    }).strict(),
    handler: async (params, context) => {
        // params 已通过 Zod 校验
        // context 含运行时上下文（executionId 等）
        return { result: params.input.toUpperCase() };
    },
    timeoutMs: 5000,                         // 可选，工具超时（默认 TOOL_EXECUTION_TIMEOUT_MS）
};

function register(toolRegistry) {
    toolRegistry.register(myTool);
}

module.exports = { register };
```

---

## 2. 加载机制

平台启动时自动扫描 `./plugins/`：
1. 遍历所有子目录
2. 读取 `package.json` 获取 `main`
3. `require()` 入口，调用 `register(toolRegistry)`
4. **单插件加载失败仅记日志，不阻塞其他插件**

加载日志：
```
INFO plugin loaded { plugin: "your-plugin-name" }
WARN plugin load failed { pluginDir: "./plugins/broken", err: "..." }
```

---

## 3. 在工作流中调用插件工具

插件注册的工具与内置工具地位等同：
```yaml
name: my-flow
nodes:
  - id: reverse
    type: tool
    toolName: myTool        # 即插件中 register 的 name
    params:
      input: "{{userQuestion}}"
edges: []
```

---

## 4. 完整示例：`reverseString` 插件

仓库自带 `plugins/exampleTool/`，演示字符串反转工具：

### `plugins/exampleTool/package.json`
```json
{
  "name": "reverse-string-plugin",
  "version": "1.0.0",
  "main": "index.js"
}
```

### `plugins/exampleTool/index.js`
```js
const { z } = require('zod');

const reverseString = {
    name: 'reverseString',
    description: '将字符串按字符反转（演示插件机制）',
    paramsSchema: z.object({ input: z.string().min(1).max(1000) }).strict(),
    handler: async ({ input }) => ({ result: [...input].reverse().join('') }),
};

function register(toolRegistry) {
    toolRegistry.register(reverseString);
}

module.exports = { register, reverseString };
```

---

## 5. 最佳实践

### ✅ 推荐
- **paramsSchema 使用 `.strict()`**：拒绝未声明字段，避免错误透传
- **handler 是纯 async 函数**：失败抛 `Error`，由平台统一处理重试
- **timeoutMs 显式设置**：超过 10s 的网络调用建议显式声明 30s
- **使用 `context.db`** 而非全局连接：便于测试注入
- **handler 内不要写 SQL**：通过参数接收 connection 或调用现有 Repository

### ❌ 避免
- **不要在 `register()` 中执行业务逻辑**：仅做注册
- **不要导入业务模块**（agentService 等）：插件应是纯工具
- **不要持有全局状态**：handler 应可重入
- **不要 `require('fs')` 写入项目内文件**：副作用难以追踪

---

## 6. 调试技巧

### 本地测试单个插件
```js
const { createRegistry } = require('./src/toolRegistry/toolRegistry');
const plugin = require('./plugins/myPlugin');
const reg = createRegistry();
plugin.register(reg);

const result = await reg.executeTool('myTool', { input: 'hello' });
console.log(result);
```

### 验证插件被加载
```bash
curl http://localhost:3000/agents \
  -H "Authorization: Bearer <jwt>"
# 服务启动日志会打印每个被加载的 plugin
```

---

## 7. 安全须知（V1.0 限制）

⚠️ **当前插件在主进程内运行，拥有完整 Node.js 权限**：
- 可访问 `process.env`、文件系统、网络
- 可阻塞 Event Loop（影响整服务）
- 内存泄漏会累积

**MVP 阶段务必**：
- 仅加载**可信来源**插件
- Code Review 关注 `fs`/`child_process`/`net` 调用
- 高并发场景前在 staging 环境压测

**V2 计划**：引入 `isolated-vm` 沙箱限制权限。

---

## 8. 发布到 npm（V2 路线）

未来版本将支持：
```bash
npm install @your-org/xscaffold-plugin-foo
```
并自动加载 `node_modules/@your-org/xscaffold-plugin-*` 下符合协议的包。当前 v1.0 仅支持本地 `./plugins/` 目录。
