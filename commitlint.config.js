// [scaffold] ID: T0.2 | Date: 2026-05-18 | Description: Commitlint 配置，强制 conventional commits 格式
'use strict';

module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci', 'build', 'revert', 'style'],
        ],
        'subject-case': [0],
        'body-max-line-length': [0],
        'footer-max-line-length': [0],
    },
};
