// [refactor] ID: V2-AGENT-LOOP | Date: 2026-05-20 | Description: Agentic tool-calling 循环——LLM 决策调 tool → 执行 → observation 回灌，白名单约束 + IOOR 全留痕
'use strict';

const crypto = require('crypto');

const { toOpenAITools } = require('../infrastructure/llmClient/toolSchemaAdapter');
const { computeProfileHash } = require('../observability/profileHash');

const DEFAULT_MAX_ITERATIONS = Number(process.env.AGENT_MAX_ITERATIONS) || 8;

/**
 * @param {object} params
 * @param {object} params.agent     agent 实体（含 model / tools[] / description）
 * @param {string} params.prompt    用户指令
 * @param {{ llmClient, toolRegistry, ioorRecorder, db }} params.deps
 * @param {{ executionId?, sessionId? }} [params.ctx]
 * @param {number} [params.maxIterations]
 * @returns {Promise<{ content, turns, tokenUsage, stopReason }>}
 */
async function runAgentLoop({ agent, prompt, deps, ctx = {}, maxIterations = DEFAULT_MAX_ITERATIONS, onEvent }) {
    const toolDefs = resolveAgentTools(agent, deps.toolRegistry);
    const openaiTools = toOpenAITools(toolDefs);
    const allowed = new Set(agent.tools || []);
    const messages = [systemMessage(agent), { role: 'user', content: prompt }];

    const acc = { turns: [], tokenUsage: emptyUsage(), lastContent: '' };
    for (let turnIndex = 0; turnIndex < maxIterations; turnIndex += 1) {
        const result = await deps.llmClient.chat({ model: agent.model, messages, tools: openaiTools });
        accumulateUsage(acc.tokenUsage, result.tokenUsage);
        acc.lastContent = result.content || acc.lastContent;

        const calls = result.toolCalls || [];
        if (calls.length === 0) {
            const turn = { turnIndex, content: result.content, toolCalls: [], observations: [] };
            acc.turns.push(turn);
            await recordTurn({ agent, turnIndex, messages, result, observations: [], ctx, deps });
            emitTurn(onEvent, turn);
            return finalize(acc, 'final');
        }

        messages.push(assistantToolCallMessage(result));
        const observations = await executeCalls(calls, allowed, deps, messages);
        const turn = { turnIndex, content: result.content, toolCalls: calls, observations };
        acc.turns.push(turn);
        await recordTurn({ agent, turnIndex, messages, result, observations, ctx, deps });
        emitTurn(onEvent, turn);
    }
    return finalize(acc, 'max_iterations');
}

function resolveAgentTools(agent, toolRegistry) {
    const defs = [];
    for (const name of agent.tools || []) {
        try {
            defs.push(toolRegistry.getTool(name));
        } catch (_err) {
            // agent 绑了不存在的 tool —— 跳过，不阻断
        }
    }
    return defs;
}

function systemMessage(agent) {
    const persona = agent.description ? `${agent.name}: ${agent.description}` : agent.name;
    return {
        role: 'system',
        content:
            `You are ${persona}. You can call the provided tools to gather information and take actions. ` +
            'Call tools as needed; when you have enough to answer, reply with a final message and no tool call.',
    };
}

function assistantToolCallMessage(result) {
    const msg = {
        role: 'assistant',
        content: result.content || null,
        tool_calls: (result.toolCalls || []).map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
        })),
    };
    // DeepSeek / reasoning model 协议：返回的 reasoning_content 必须在下一轮 assistant turn 中透传回去。
    // OpenAI 官方端点不存在此字段，仅在有值时附加，不影响兼容性。
    if (result.reasoning_content) {
        msg.reasoning_content = result.reasoning_content;
    }
    return msg;
}

async function executeCalls(calls, allowed, deps, messages) {
    const observations = [];
    for (const call of calls) {
        const observation = await executeOneCall(call, allowed, deps);
        observations.push(observation);
        messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(observation),
        });
    }
    return observations;
}

async function executeOneCall(call, allowed, deps) {
    if (!allowed.has(call.name)) {
        return { name: call.name, ok: false, error: `tool not allowed for this agent: ${call.name}` };
    }
    try {
        const data = await deps.toolRegistry.executeTool(call.name, call.arguments, { db: deps.db });
        return { name: call.name, ok: true, data };
    } catch (err) {
        return { name: call.name, ok: false, error: err.message };
    }
}

async function recordTurn({ agent, turnIndex, messages, result, observations, ctx, deps }) {
    if (!deps.ioorRecorder || !ctx.executionId) {
        return;
    }
    await deps.ioorRecorder.record({
        executionId: ctx.executionId,
        nodeId: `agent:${agent.id}`,
        turnIndex,
        agentId: agent.id,
        profileHash: computeProfileHash(agent),
        modelProvider: 'openai',
        modelName: agent.model,
        input: { messages },
        output: { content: result.content, reasoning_content: result.reasoning_content },
        toolCalls: result.toolCalls || [],
        observations,
        tokenUsage: result.tokenUsage ?? null,
        latencyMs: result.latencyMs ?? null,
    });
}

// 流式钩子：每完成一个 turn 推一个 SSE turn 事件。onEvent 缺省时全程 no-op，
// 同步 /invoke 路径与既有调用方零行为变化。
function emitTurn(onEvent, turn) {
    if (typeof onEvent !== 'function') {
        return;
    }
    onEvent({
        type: 'turn',
        turnIndex: turn.turnIndex,
        content: turn.content || '',
        toolCalls: turn.toolCalls,
        observations: turn.observations,
        ts: new Date().toISOString(),
    });
}

function finalize(acc, stopReason) {
    return {
        content: acc.lastContent,
        turns: acc.turns,
        tokenUsage: acc.tokenUsage,
        stopReason,
    };
}

function emptyUsage() {
    return { prompt: 0, completion: 0, total: 0, cached_prompt_tokens: 0 };
}

function accumulateUsage(target, usage) {
    if (!usage) {
        return;
    }
    target.prompt += usage.prompt || 0;
    target.completion += usage.completion || 0;
    target.total += usage.total || 0;
    target.cached_prompt_tokens += usage.cached_prompt_tokens || 0;
}

function newInvocationId() {
    return `inv_${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = { runAgentLoop, newInvocationId, DEFAULT_MAX_ITERATIONS };
