// [scaffold] ID: T2.2 | Date: 2026-05-18 | Description: 内置工具 sendEmail——MVP 阶段仅打日志（无外部依赖）
'use strict';

const { z } = require('zod');
const { logger } = require('../../observability/logger');

const paramsSchema = z
    .object({
        to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(10000),
        from: z.string().email().optional(),
    })
    .strict();

async function handler(params) {
    // MVP：不真实发邮件，仅记录脱敏后的元数据。V1 接入 SMTP/SES。
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    logger.info({ recipients, subject: params.subject, bodyLength: params.body.length }, 'sendEmail (stub) invoked');
    return {
        delivered: true,
        recipients,
        messageId: `stub_${Date.now()}`,
    };
}

module.exports = {
    name: 'sendEmail',
    description: '发送邮件（MVP 阶段为 stub 实现）',
    paramsSchema,
    handler,
};
