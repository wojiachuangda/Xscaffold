// [scaffold] ID: T2.1 | Date: 2026-05-18 | Description: 工具注册中心——注册/查询/执行，含超时与参数校验
'use strict';

const { ToolDefSchema } = require('./toolSchema');
const { ValidationError, NotFoundError, ConflictError, TimeoutError } = require('../infrastructure/errors/AppError');

const DEFAULT_TIMEOUT_MS = Number(process.env.TOOL_EXECUTION_TIMEOUT_MS) || 10000;

function createRegistry() {
    const tools = new Map();

    function register(toolDef) {
        const r = ToolDefSchema.safeParse(toolDef);
        if (!r.success) {
            throw new ValidationError('工具定义不合法', formatIssues(r.error));
        }
        if (tools.has(toolDef.name)) {
            throw new ConflictError(`工具名已注册: ${toolDef.name}`);
        }
        tools.set(toolDef.name, toolDef);
    }

    function unregister(name) {
        return tools.delete(name);
    }

    function getTool(name) {
        const t = tools.get(name);
        if (!t) {
            throw new NotFoundError(`工具不存在: ${name}`);
        }
        return t;
    }

    function listTools() {
        return Array.from(tools.values()).map(({ name, description }) => ({ name, description }));
    }

    async function executeTool(name, params, context = {}) {
        const tool = getTool(name);
        const parsed = parseParams(tool, params);
        const timeoutMs = tool.timeoutMs || DEFAULT_TIMEOUT_MS;
        return await withTimeout(tool.handler(parsed, context), timeoutMs, name);
    }

    return { register, unregister, getTool, listTools, executeTool };
}

function parseParams(tool, params) {
    const r = tool.paramsSchema.safeParse(params);
    if (!r.success) {
        throw new ValidationError(`工具 ${tool.name} 参数不合法`, formatIssues(r.error));
    }
    return r.data;
}

function withTimeout(promise, ms, toolName) {
    let timer;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(`工具执行超时: ${toolName} (${ms}ms)`)), ms);
        timer.unref?.();
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function formatIssues(zodError) {
    return zodError.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        message: i.message,
    }));
}

const defaultRegistry = createRegistry();

module.exports = { createRegistry, defaultRegistry };
