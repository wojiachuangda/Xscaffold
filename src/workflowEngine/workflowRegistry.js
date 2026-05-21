// [scaffold] ID: T4.3 | Date: 2026-05-18 | Description: 工作流定义注册中心（内存版，可由 YAML 扫描或代码预定义喂入）
'use strict';

const fs = require('fs');
const path = require('path');

const { ConflictError, NotFoundError } = require('../infrastructure/errors/AppError');
const { logger } = require('../observability/logger');

function createWorkflowRegistry() {
    const flows = new Map();

    function register(id, workflowDef) {
        if (flows.has(id)) {
            throw new ConflictError(`工作流已注册: ${id}`);
        }
        flows.set(id, workflowDef);
        return { id };
    }

    function upsert(id, workflowDef) {
        flows.set(id, workflowDef);
        return { id };
    }

    function get(id) {
        const def = flows.get(id);
        if (!def) {
            throw new NotFoundError(`工作流不存在: ${id}`);
        }
        return def;
    }

    function list() {
        return Array.from(flows.entries()).map(([id, def]) => ({
            id,
            name: def.name,
            version: def.version,
            description: def.description,
            trigger: def.trigger || null,
            nodeCount: def.nodes.length,
        }));
    }

    function remove(id) {
        return flows.delete(id);
    }

    return { register, upsert, get, list, remove };
}

/**
 * 从目录扫描 .yaml/.yml/.json 加载工作流，文件名（不含扩展名）作为 id
 * @param {object} options
 * @param {string} options.dir
 * @param {ReturnType<typeof createWorkflowRegistry>} options.registry
 * @param {Function} options.loadFn  configLoader.loadFromFile
 */
async function loadFromDirectory({ dir, registry, loadFn }) {
    if (!fs.existsSync(dir)) {
        return { loaded: [], failed: [] };
    }
    const files = fs.readdirSync(dir).filter((f) => /\.(ya?ml|json)$/i.test(f));
    const loaded = [];
    const failed = [];
    for (const file of files) {
        const id = path.basename(file, path.extname(file));
        try {
            const cfg = await loadFn(path.join(dir, file));
            registry.upsert(id, cfg);
            loaded.push(id);
        } catch (err) {
            failed.push({ id, error: err.message });
            logger.warn({ file, err: err.message }, 'workflow load failed');
        }
    }
    return { loaded, failed };
}

/**
 * 同步版本——createApp 启动期装载用（避免把 createApp 改为 async）。
 * 单文件失败不抛，归入 failed；调用方按需决定是否抛。
 */
function loadFromDirectorySync({ dir, registry, loadFnSync }) {
    if (!fs.existsSync(dir)) {
        return { loaded: [], failed: [] };
    }
    const files = fs.readdirSync(dir).filter((f) => /\.(ya?ml|json)$/i.test(f));
    const loaded = [];
    const failed = [];
    for (const file of files) {
        const id = path.basename(file, path.extname(file));
        try {
            const cfg = loadFnSync(path.join(dir, file));
            registry.upsert(id, cfg);
            loaded.push(id);
        } catch (err) {
            failed.push({ id, error: err.message });
            logger.warn({ file, err: err.message }, 'workflow load failed');
        }
    }
    return { loaded, failed };
}

module.exports = { createWorkflowRegistry, loadFromDirectory, loadFromDirectorySync };
