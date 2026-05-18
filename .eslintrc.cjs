// [scaffold] ID: T0.1 | Date: 2026-05-18 | Description: ESLint 规则配置（强制 AA-SEAC §1.2/§1.3/§1.4 规范）
module.exports = {
    root: true,
    env: {
        node: true,
        es2022: true,
        jest: true,
    },
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
    },
    extends: ['eslint:recommended'],
    rules: {
        // AA-SEAC §1.2 缩进与格式
        indent: ['error', 4, { SwitchCase: 1 }],
        'linebreak-style': 'off',
        quotes: ['error', 'single', { avoidEscape: true }],
        semi: ['error', 'always'],
        'max-len': ['error', { code: 120, ignoreUrls: true, ignoreStrings: true }],

        // AA-SEAC §1.3 设计原则
        'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
        'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
        'max-depth': ['error', 3],
        'max-params': ['error', 4],
        complexity: ['warn', 10],

        // AA-SEAC §1.4 异常处理
        'no-empty': ['error', { allowEmptyCatch: false }],
        'no-throw-literal': 'error',

        // 通用质量
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'prefer-const': 'error',
        eqeqeq: ['error', 'always'],
        curly: ['error', 'all'],
        'no-var': 'error',
    },
    overrides: [
        {
            files: ['tests/**/*.js', '**/*.test.js'],
            rules: {
                'max-lines-per-function': 'off',
                'max-lines': 'off',
            },
        },
    ],
};
