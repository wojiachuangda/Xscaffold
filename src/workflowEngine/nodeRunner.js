// [scaffold] ID: T2.6 | Date: 2026-05-18 | Description: 节点执行器（agent/tool/condition/code）+ 超时与指数退避重试
'use strict';

const { renderTemplate, evaluateBoolean } = require('./expressionEvaluator');
const { TimeoutError, AppError, ValidationError } = require('../infrastructure/errors/AppError');

const DEFAULT_NODE_TIMEOUT_MS = Number(process.env.MAX_WORKFLOW_TIMEOUT_MS) || 30000;

/**
 * @param {object} deps  注入运行时依赖：{ toolRegistry, agentService, llmClient }
 */
function createNodeRunner(deps) {
    const runners = {
        agent: (node, ctx) => runAgentNode(node, ctx, deps),
        tool: (node, ctx) => runToolNode(node, ctx, deps),
        condition: (node, ctx) => runConditionNode(node, ctx),
        code: (node, ctx) => runCodeNode(node, ctx),
    };

    async function runNode(node, ctx) {
        const runner = runners[node.type];
        if (!runner) {
            throw new ValidationError(`未知节点类型: ${node.type}`);
        }
        return runWithRetry(node, () => withTimeout(runner(node, ctx), nodeTimeoutMs(node), node.id));
    }

    return { runNode };
}

function nodeTimeoutMs(node) {
    return node.timeoutMs || DEFAULT_NODE_TIMEOUT_MS;
}

async function runWithRetry(node, fn) {
    const policy = node.retry || { maxAttempts: 1, backoffMs: 1000 };
    let lastError;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt >= policy.maxAttempts) {
                throw err;
            }
            await sleep(policy.backoffMs * 2 ** (attempt - 1));
        }
    }
    throw lastError;
}

function withTimeout(promise, ms, label) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(`节点超时: ${label} (${ms}ms)`)), ms);
        timer.unref?.();
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function sleep(ms) {
    return new Promise((r) => {
        const t = setTimeout(r, ms);
        t.unref?.();
    });
}

async function runAgentNode(node, ctx, { agentService, llmClient }) {
    if (!agentService || !llmClient) {
        throw new AppError('runAgentNode 缺少依赖: agentService / llmClient');
    }
    const agent = agentService.getAgentById(node.agentId);
    const userPrompt = resolveInput(node.input, ctx);
    const result = await llmClient.chat({
        model: agent.model,
        messages: [{ role: 'user', content: userPrompt }],
    });
    return {
        agentId: agent.id,
        content: result.content,
        reasoning_content: result.reasoning_content,
        tokenUsage: result.tokenUsage,
        latencyMs: result.latencyMs,
    };
}

async function runToolNode(node, ctx, { toolRegistry }) {
    if (!toolRegistry) {
        throw new AppError('runToolNode 缺少依赖: toolRegistry');
    }
    const params = renderParams(node.params || {}, ctx);
    return toolRegistry.executeTool(node.toolName, params, ctx);
}

async function runConditionNode(node, ctx) {
    const result = evaluateBoolean(node.expression, ctx);
    return { branch: result ? 'true' : 'false', value: result };
}

async function runCodeNode(node, ctx) {
    // MVP：仅支持 return-only 表达式（VM 沙箱见 V2）
    const rendered = renderTemplate(node.code, ctx);
    return { output: rendered };
}

function resolveInput(input, ctx) {
    if (!input) {
        return '';
    }
    if (typeof input === 'string') {
        return renderTemplate(input, ctx);
    }
    return JSON.stringify(renderParams(input, ctx));
}

function renderParams(params, ctx) {
    const out = {};
    for (const key of Object.keys(params)) {
        out[key] = renderParamValue(params[key], ctx);
    }
    return out;
}

function renderParamValue(value, ctx) {
    if (typeof value === 'string') {
        const rendered = renderTemplate(value, ctx);
        return coerceLiteral(rendered, value);
    }
    if (Array.isArray(value)) {
        return value.map((v) => renderParamValue(v, ctx));
    }
    if (value && typeof value === 'object') {
        return renderParams(value, ctx);
    }
    return value;
}

function coerceLiteral(rendered, original) {
    if (original === rendered) {
        return rendered;
    }
    if (rendered === '' || Number.isNaN(Number(rendered))) {
        return rendered;
    }
    return Number(rendered);
}

module.exports = { createNodeRunner };
