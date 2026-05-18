// [scaffold] ID: T2.3 | Date: 2026-05-18 | Description: 工作流表达式求值器（{{path}} 模板 + 安全布尔表达式，禁用 JS eval）
'use strict';

const { ValidationError } = require('../infrastructure/errors/AppError');

const TEMPLATE_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * 按点路径解引用：'a.b.0.c' → ctx.a.b[0].c
 */
function resolvePath(ctx, path) {
    const parts = path.split('.').filter(Boolean);
    let cur = ctx;
    for (const p of parts) {
        if (cur === undefined || cur === null) {
            return undefined;
        }
        cur = cur[p];
    }
    return cur;
}

/**
 * 将 `{{path}}` 占位符替换为 context 中对应的字面量字符串
 */
function renderTemplate(text, context) {
    return String(text).replace(TEMPLATE_PATTERN, (_, expr) => {
        const v = resolvePath(context, expr.trim());
        if (v === undefined || v === null) {
            return '';
        }
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
}

/**
 * 将 `{{path}}` 占位符替换为可解析的字面量（数字 / 字符串 / 布尔 / null），用于布尔表达式求值
 */
function substituteForExpression(text, context) {
    return String(text).replace(TEMPLATE_PATTERN, (_, expr) => toLiteral(resolvePath(context, expr.trim())));
}

function toLiteral(v) {
    if (v === undefined || v === null) {
        return 'null';
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
        return String(v);
    }
    return JSON.stringify(String(v));
}

/**
 * 安全布尔表达式求值（递归下降）
 * 文法：
 *   expr := orExpr
 *   orExpr := andExpr ('||' andExpr)*
 *   andExpr := notExpr ('&&' notExpr)*
 *   notExpr := '!' notExpr | cmp
 *   cmp := atom (('=='|'!='|'>='|'<='|'>'|'<') atom)?
 *   atom := number | string | bool | null | '(' expr ')'
 */
function evaluateBoolean(expression, context) {
    const substituted = substituteForExpression(expression, context);
    const tokens = tokenize(substituted);
    const parser = { tokens, pos: 0 };
    const value = parseOr(parser);
    if (parser.pos !== tokens.length) {
        throw new ValidationError(`表达式残留: ${expression}`);
    }
    return Boolean(value);
}

const TOKEN_PATTERN = /\s*(==|!=|>=|<=|&&|\|\||[()<>!]|"(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?)/y;

function tokenize(input) {
    const out = [];
    TOKEN_PATTERN.lastIndex = 0;
    while (TOKEN_PATTERN.lastIndex < input.length) {
        const m = TOKEN_PATTERN.exec(input);
        if (!m) {
            throw new ValidationError(`非法字符 @ ${TOKEN_PATTERN.lastIndex}: ${input}`);
        }
        out.push(m[1]);
    }
    return out;
}

function peek(p) {
    return p.tokens[p.pos];
}

function consume(p) {
    return p.tokens[p.pos++];
}

function parseOr(p) {
    let left = parseAnd(p);
    while (peek(p) === '||') {
        consume(p);
        const right = parseAnd(p);
        left = Boolean(left) || Boolean(right);
    }
    return left;
}

function parseAnd(p) {
    let left = parseNot(p);
    while (peek(p) === '&&') {
        consume(p);
        const right = parseNot(p);
        left = Boolean(left) && Boolean(right);
    }
    return left;
}

function parseNot(p) {
    if (peek(p) === '!') {
        consume(p);
        return !parseNot(p);
    }
    return parseCmp(p);
}

const CMP_OPS = new Set(['==', '!=', '>=', '<=', '>', '<']);
const CMP_FUNCS = {
    '==': (a, b) => a === b,
    '!=': (a, b) => a !== b,
    '>': (a, b) => a > b,
    '<': (a, b) => a < b,
    '>=': (a, b) => a >= b,
    '<=': (a, b) => a <= b,
};

function parseCmp(p) {
    const left = parseAtom(p);
    if (CMP_OPS.has(peek(p))) {
        const op = consume(p);
        const right = parseAtom(p);
        return CMP_FUNCS[op](left, right);
    }
    return left;
}

function parseAtom(p) {
    const tok = consume(p);
    if (tok === '(') {
        const v = parseOr(p);
        if (consume(p) !== ')') {
            throw new ValidationError('括号未闭合');
        }
        return v;
    }
    if (tok === 'true') {
        return true;
    }
    if (tok === 'false') {
        return false;
    }
    if (tok === 'null') {
        return null;
    }
    if (tok.startsWith('"')) {
        return JSON.parse(tok);
    }
    if (/^-?\d+(\.\d+)?$/.test(tok)) {
        return Number(tok);
    }
    throw new ValidationError(`未知 token: ${tok}`);
}

module.exports = { renderTemplate, evaluateBoolean, resolvePath };
