// [scaffold] ID: T0.5 | Date: 2026-05-18 | Description: Jest 全局测试前置（设置 NODE_ENV=test，加载 .env，屏蔽 console 噪音）
'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
// 测试默认关闭 SSRF 守卫，让现有 mock fetch 的单测可用；
// SSRF 防护本身由 tests/unit/httpGuard.test.js 显式覆盖。
process.env.HTTP_REQUEST_BLOCK_PRIVATE_IPS = process.env.HTTP_REQUEST_BLOCK_PRIVATE_IPS || 'false';

require('dotenv').config({ path: '.env.test', override: false });
