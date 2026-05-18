// [scaffold] ID: T0.5 | Date: 2026-05-18 | Description: Jest 全局测试前置（设置 NODE_ENV=test，加载 .env，屏蔽 console 噪音）
'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

require('dotenv').config({ path: '.env.test', override: false });
