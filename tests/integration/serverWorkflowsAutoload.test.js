// [test] ID: PAM-9 | Date: 2026-05-19 | Description: createApp 启动期 workflows/ 自动装载行为（容错 vs strict）
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

process.env.AUTH_DISABLED = 'true';
process.env.NODE_ENV = 'test';

const { createApp } = require('../../src/apiGateway/server');

function makeTempDir(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xs-wf-'));
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content, 'utf8');
    }
    return dir;
}

describe('createApp workflows 自动装载 (PAM-9)', () => {
    test('默认装载真实 workflows/ 目录——project-assistant-digest 可见', async () => {
        const app = createApp();
        const res = await request(app).get('/workflows');
        expect(res.status).toBe(200);
        expect(res.body.data.map((w) => w.id)).toContain('project-assistant-digest');
    });

    test('非严格模式：坏 YAML 不影响 createApp 启动', () => {
        const dir = makeTempDir({ 'broken.yaml': 'description: 缺少 name 和 nodes 的非法工作流' });
        expect(() => createApp({ workflowsDir: dir })).not.toThrow();
    });

    test('非严格模式：坏 YAML 被跳过，好 workflow 仍可见', async () => {
        // 注册 id 取文件名 stem（非 YAML 内 name 字段）
        const dir = makeTempDir({
            'broken.yaml': 'name: ""',
            'ok.yaml':
                'name: ok-flow\nnodes:\n  - id: n1\n    type: tool\n    toolName: addNumbers\n    params: { a: 1, b: 2 }\n',
        });
        const app = createApp({ workflowsDir: dir });
        const res = await request(app).get('/workflows');
        const ids = res.body.data.map((w) => w.id);
        expect(ids).toContain('ok');
        expect(ids).not.toContain('broken');
    });

    test('strict 模式：坏 YAML 让 createApp 直接抛错', () => {
        const dir = makeTempDir({ 'broken.yaml': 'description: 没有 name 和 nodes' });
        expect(() => createApp({ workflowsDir: dir, strictWorkflowLoad: true })).toThrow();
    });

    test('strict 模式：全部 YAML 合法时正常启动', () => {
        const dir = makeTempDir({
            'ok.yaml':
                'name: ok-flow\nnodes:\n  - id: n1\n    type: tool\n    toolName: addNumbers\n    params: { a: 1, b: 2 }\n',
        });
        expect(() => createApp({ workflowsDir: dir, strictWorkflowLoad: true })).not.toThrow();
    });
});
