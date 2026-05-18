#!/usr/bin/env node
// [scaffold] ID: T0.2 | Date: 2026-05-18 | Description: 新建源文件头注释格式校验脚本（AA-SEAC §1.3）
'use strict';

const fs = require('fs');
const path = require('path');

const AASEAC_PATTERN = /^\/\/\s*\[[^\]]+\]\s*ID:\s*\S+\s*\|\s*Date:\s*\d{4}-\d{2}-\d{2}\s*\|\s*Description:\s*\S/;
const JSDOC_FILE_PATTERN = /^\/\*\*[\s\S]*?@file\s+\S+[\s\S]*?\*\//m;

const files = process.argv.slice(2);
const violations = [];

for (const file of files) {
    if (!file.endsWith('.js')) {
        continue;
    }
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) {
        continue;
    }
    const content = fs.readFileSync(abs, 'utf8');
    if (!content.trim()) {
        continue;
    }
    // 接受 JSDoc 风格（首部 @file 块）
    if (JSDOC_FILE_PATTERN.test(content.slice(0, 500))) {
        continue;
    }
    // 接受 AA-SEAC 风格（首条有意义注释行）
    const lines = content.split(/\r?\n/);
    const firstNonEmpty = lines.find((l) => l.trim() !== '');
    const headerLine = firstNonEmpty && firstNonEmpty.startsWith('#!') ? lines[1] : firstNonEmpty;
    if (!headerLine || !AASEAC_PATTERN.test(headerLine.trim())) {
        violations.push(file);
    }
}

if (violations.length > 0) {
    /* eslint-disable no-console */
    console.error('文件头注释格式不合规（AA-SEAC §1.3）:');
    violations.forEach((f) => console.error(`  - ${f}`));
    console.error('期望格式: // [{角色}] ID: {任务编号} | Date: {YYYY-MM-DD} | Description: {描述}');
    /* eslint-enable no-console */
    process.exit(1);
}
