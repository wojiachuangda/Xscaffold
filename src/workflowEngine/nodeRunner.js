// [scaffold] ID: T2.6+T5.x | Date: 2026-05-18 | Description: 节点执行器：四类节点 + 超时/重试 + 记忆/IOOR/自愈/trace 集成
'use strict';

const { renderTemplate, evaluateBoolean } = require('./expressionEvaluator');
const { runWithSelfHealing } = require('./selfHealing');
const { assertBeforeCall, recordTokens } = require('./tokenQuota');
const { TimeoutError, AppError, ValidationError } = require('../infrastructure/errors/AppError');
const { computeProfileHash } = require('../observability/profileHash');

const DEFAULT_NODE_TIMEOUT_MS = Number(process.env.MAX_WORKFLOW_TIMEOUT_MS) || 30000;

class StuckError extends AppError {
    constructor(message, details) {
        super(message, { code: 'STUCK', status: 500, details });
    }
}

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

    return { runNode, StuckError };
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
            // STUCK 不应被重试（业务永久失败）
            if (err.code === 'STUCK' || attempt >= policy.maxAttempts) {
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

async function runAgentNode(node, ctx, deps) {
    const { agentService, llmClient } = deps;
    if (!agentService || !llmClient) {
        throw new AppError('runAgentNode 缺少依赖: agentService / llmClient');
    }
    const agent = agentService.getAgentById(node.agentId);
    const userPrompt = resolveInput(node.input, ctx);
    const baseMessages = buildLLMMessages(agent, userPrompt, ctx, deps);
    const healed = await invokeLLMWithHealing(agent, baseMessages, llmClient, ctx);
    recordAgentTurns({ agent, baseMessages, healed, node, ctx, deps });
    if (!healed.ok) {
        throw new StuckError(`Agent 自愈耗尽: ${node.id}`, { reason: healed.reason });
    }
    persistMemory({ agent, userPrompt, healed, ctx, deps });
    return buildAgentOutput(agent, healed);
}

function buildLLMMessages(agent, userPrompt, ctx, deps) {
    const history = pullHistory(ctx, deps);
    return [...history, { role: 'user', content: userPrompt }];
}

function pullHistory(ctx, deps) {
    if (!deps.memoryStore || !ctx.sessionId) {
        return [];
    }
    const items = deps.memoryStore.getHistory({ sessionId: ctx.sessionId });
    return items.map((m) => ({ role: m.role, content: m.content }));
}

async function invokeLLMWithHealing(agent, baseMessages, llmClient, ctx) {
    return runWithSelfHealing({
        callLLM: async (extra) => {
            assertBeforeCall(ctx);
            const messages = extra ? [...baseMessages, { role: 'system', content: extra }] : baseMessages;
            const result = await llmClient.chat({ model: agent.model, messages });
            recordTokens(ctx, result?.tokenUsage);
            return result;
        },
    });
}

function recordAgentTurns({ agent, baseMessages, healed, node, ctx, deps }) {
    if (!deps.ioorRecorder || !ctx.executionId) {
        return;
    }
    const turnIndex = bumpTurnCounter(ctx);
    deps.ioorRecorder.record({
        executionId: ctx.executionId,
        nodeId: node.id,
        turnIndex,
        agentId: agent.id,
        profileHash: computeProfileHash(agent),
        modelProvider: 'openai',
        modelName: agent.model,
        input: { messages: baseMessages },
        output: healed.result
            ? { content: healed.result.content, reasoning_content: healed.result.reasoning_content }
            : null,
        toolCalls: [],
        observations: [],
        tokenUsage: healed.result?.tokenUsage ?? null,
        latencyMs: healed.result?.latencyMs ?? null,
    });
}

function bumpTurnCounter(ctx) {
    if (typeof ctx._turnCounter !== 'number') {
        Object.defineProperty(ctx, '_turnCounter', { value: 0, writable: true, enumerable: false });
    }
    const next = ctx._turnCounter;
    ctx._turnCounter += 1;
    return next;
}

function persistMemory({ agent, userPrompt, healed, ctx, deps }) {
    if (!deps.memoryStore || !ctx.sessionId || !healed.ok) {
        return;
    }
    deps.memoryStore.saveMessage({
        sessionId: ctx.sessionId,
        role: 'user',
        content: userPrompt,
        metadata: { agentId: agent.id },
    });
    deps.memoryStore.saveMessage({
        sessionId: ctx.sessionId,
        role: 'assistant',
        content: healed.result.content,
        metadata: { agentId: agent.id, model: agent.model },
    });
}

function buildAgentOutput(agent, healed) {
    return {
        agentId: agent.id,
        content: healed.result.content,
        reasoning_content: healed.result.reasoning_content,
        tokenUsage: healed.result.tokenUsage,
        latencyMs: healed.result.latencyMs,
        attempts: healed.attempts,
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

module.exports = { createNodeRunner, StuckError };
