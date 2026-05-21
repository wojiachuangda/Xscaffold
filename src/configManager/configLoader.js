// [scaffold] ID: T3.2 | Date: 2026-05-18 | Description: 配置加载器——YAML/JSON 解析 + Zod 校验 + 转换为 workflowDef
'use strict';

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { WorkflowConfigSchema } = require('./configSchema');
const { ValidationError, AppError } = require('../infrastructure/errors/AppError');

const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);
const JSON_EXTENSIONS = new Set(['.json']);

/**
 * 从文件加载配置
 * @param {string} filePath  绝对或相对路径
 * @returns {Promise<object>} 已通过 Zod 校验的 workflowConfig
 */
async function loadFromFile(filePath) {
    const abs = path.resolve(filePath);
    const ext = path.extname(abs).toLowerCase();
    assertSupportedExtension(ext, abs);
    const raw = await readFileSafe(abs);
    const parsed = parseByExtension(raw, ext, abs);
    return validateSchema(parsed);
}

/**
 * 同步版本——createApp 启动期装载用（避免把 createApp 改为 async）。
 */
function loadFromFileSync(filePath) {
    const abs = path.resolve(filePath);
    const ext = path.extname(abs).toLowerCase();
    assertSupportedExtension(ext, abs);
    let raw;
    try {
        raw = fsSync.readFileSync(abs, 'utf8');
    } catch (err) {
        throw new AppError(`配置文件读取失败: ${abs}`, {
            code: 'CONFIG_READ_ERROR',
            status: 400,
            cause: err,
        });
    }
    const parsed = parseByExtension(raw, ext, abs);
    return validateSchema(parsed);
}

function assertSupportedExtension(ext, abs) {
    if (!YAML_EXTENSIONS.has(ext) && !JSON_EXTENSIONS.has(ext)) {
        throw new ValidationError(`不支持的配置文件后缀: ${ext}`, [{ path: abs }]);
    }
}

async function readFileSafe(abs) {
    try {
        return await fs.readFile(abs, 'utf8');
    } catch (err) {
        throw new AppError(`配置文件读取失败: ${abs}`, {
            code: 'CONFIG_READ_ERROR',
            status: 400,
            cause: err,
        });
    }
}

function parseByExtension(raw, ext, abs) {
    if (YAML_EXTENSIONS.has(ext)) {
        return parseYaml(raw, abs);
    }
    if (JSON_EXTENSIONS.has(ext)) {
        return parseJson(raw, abs);
    }
    throw new ValidationError(`不支持的配置文件后缀: ${ext}`, [{ path: abs }]);
}

function parseYaml(raw, abs) {
    try {
        return yaml.load(raw, { filename: abs });
    } catch (err) {
        throw new ValidationError('YAML 解析失败', [
            {
                path: abs,
                code: 'YAML_PARSE_ERROR',
                message: err.message,
                line: err.mark?.line,
                column: err.mark?.column,
            },
        ]);
    }
}

function parseJson(raw, abs) {
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new ValidationError('JSON 解析失败', [{ path: abs, code: 'JSON_PARSE_ERROR', message: err.message }]);
    }
}

/**
 * 单独校验（已解析的对象）
 */
function validateSchema(config) {
    const r = WorkflowConfigSchema.safeParse(config);
    if (!r.success) {
        throw new ValidationError('配置不合法', formatIssues(r.error));
    }
    return r.data;
}

/**
 * 转换为 workflowEngine 接受的 workflowDef
 * MVP：type=workflow 的 ref 节点会被剥离为占位 condition 节点（待 V1 解引用）
 */
function toWorkflowDef(config) {
    const validated = validateSchema(config);
    return {
        name: validated.name,
        version: validated.version,
        description: validated.description,
        trigger: validated.trigger,
        nodes: validated.nodes.map(translateNode),
        edges: validated.edges,
    };
}

function translateNode(node) {
    if (node.type === 'workflow') {
        // MVP 占位：执行时永远走 false 分支，提醒未解引用
        return {
            id: node.id,
            type: 'condition',
            description: `[unresolved ref: ${node.ref}]`,
            expression: 'false',
            timeoutMs: node.timeoutMs,
            retry: node.retry,
        };
    }
    return node;
}

function formatIssues(zodError) {
    return zodError.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        code: i.code,
        message: i.message,
    }));
}

module.exports = { loadFromFile, loadFromFileSync, validateSchema, toWorkflowDef };
