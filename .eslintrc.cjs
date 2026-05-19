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
    // 'prettier' 必须放在末尾：关闭所有与 Prettier 冲突的格式化规则
    // .prettierrc.json 已严格对齐 AA-SEAC §1.2（4 空格 / 120 宽 / 单引号 / 分号），合规未弱化
    extends: ['eslint:recommended', 'prettier'],
    rules: {
        // AA-SEAC §1.2 缩进/引号/分号/单行宽度 — 由 Prettier 接管
        // .prettierrc.json: tabWidth=4 / singleQuote=true / semi=true / printWidth=120 / endOfLine=lf
        // ESLint 不再重复定义，避免与 Prettier 互相打架

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
        // A.1 引入：async 函数必须 await 至少一处（防止"裸 async wrapper"）；
        // 对 sqliteDriver 内部包装 better-sqlite3 同步调用的方法用 inline disable 豁免
        'require-await': 'error',
    },
    overrides: [
        {
            files: ['tests/**/*.js', '**/*.test.js'],
            rules: {
                'max-lines-per-function': 'off',
                'max-lines': 'off',
                // 测试中 mock 常用 `async () => stub` 形式，require-await 噪声大且无收益
                'require-await': 'off',
            },
        },
    ],
};
