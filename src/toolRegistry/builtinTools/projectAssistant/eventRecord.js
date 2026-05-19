// [planner] ID: PAM-4 | Date: 2026-05-19 | Description: 内置工具 eventRecord——记录重要项目事件（不可变流水；落库前走脱敏）
'use strict';

const { RecordEventSchema } = require('../../../domain/projectAssistant/schemas/eventSchema');
const { buildEventRepository } = require('../../../domain/projectAssistant/repositories/eventRepository');
const { redactSensitive } = require('../../../observability/redact');

async function handler(params, context = {}) {
    const repo = buildEventRepository(context.db);
    // PLAN §7.8 / AA-SEAC §4.5：事件落库前必经项目脱敏通道（按字段名脱敏）
    const redacted = redactSensitive(params);
    const event = await repo.insert(redacted);
    return {
        ok: true,
        data: { eventId: event.eventId, createdAt: event.createdAt },
    };
}

module.exports = {
    name: 'eventRecord',
    description: '记录重要项目事件（不可变流水；落库前走脱敏）',
    paramsSchema: RecordEventSchema,
    handler,
    timeoutMs: 5000,
};
