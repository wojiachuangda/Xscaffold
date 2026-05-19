// [planner] ID: PAM-2 | Date: 2026-05-19 | Description: 项目助理内置工具索引——汇总 9 个 MVP Tool（按 PAM 阶段逐步填充）
'use strict';

const projectGetStatus = require('./projectGetStatus');
const projectUpdateStatus = require('./projectUpdateStatus');
const taskList = require('./taskList');
const taskUpsert = require('./taskUpsert');
const eventRecord = require('./eventRecord');
const reminderCreate = require('./reminderCreate');
const reminderListDue = require('./reminderListDue');

const PROJECT_ASSISTANT_TOOLS = [
    projectGetStatus,
    projectUpdateStatus,
    taskList,
    taskUpsert,
    eventRecord,
    reminderCreate,
    reminderListDue,
];

module.exports = { PROJECT_ASSISTANT_TOOLS };
