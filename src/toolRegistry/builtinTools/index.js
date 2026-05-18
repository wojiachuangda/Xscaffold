// [scaffold] ID: T2.2 | Date: 2026-05-18 | Description: 内置工具索引——注册到默认 registry
'use strict';

const addNumbers = require('./addNumbers');
const httpRequest = require('./httpRequest');
const readFile = require('./readFile');
const queryDatabase = require('./queryDatabase');
const sendEmail = require('./sendEmail');

const BUILTIN_TOOLS = [addNumbers, httpRequest, readFile, queryDatabase, sendEmail];

function registerBuiltins(registry) {
    for (const tool of BUILTIN_TOOLS) {
        registry.register(tool);
    }
    return registry;
}

module.exports = { BUILTIN_TOOLS, registerBuiltins };
