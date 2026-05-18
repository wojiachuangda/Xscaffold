// [scaffold] ID: T0.5 | Date: 2026-05-18 | Description: Jest 配置（覆盖率阈值 80%，单元/集成/E2E 分层）
'use strict';

module.exports = {
    testEnvironment: 'node',
    rootDir: '.',
    roots: ['<rootDir>/src', '<rootDir>/tests'],
    testMatch: ['**/?(*.)+(test|spec).js'],
    setupFiles: ['<rootDir>/tests/setup.js'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/main.js',
        '!src/**/index.js',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    verbose: true,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 10000,
};
