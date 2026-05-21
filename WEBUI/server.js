// [ui] ID: WEBUI-MVP | Date: 2026-05-20 | Description: WEBUI static server and backend API proxy
'use strict';

const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const { Readable } = require('node:stream');

const HOST = process.env.WEBUI_HOST || '127.0.0.1';
const PORT = Number(process.env.WEBUI_PORT) || 5173;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const ROOT_DIR = __dirname;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
    routeRequest(req, res).catch((err) => sendError(res, err));
});

server.listen(PORT, HOST, () => {
    writeStartupMessage();
});

function writeStartupMessage() {
    try {
        process.stdout.write(`WEBUI listening on http://${HOST}:${PORT} -> ${BACKEND_URL}\n`);
    } catch (err) {
        if (process.env.WEBUI_DEBUG === 'true') {
            process.stderr.write(`${err.message}\n`);
        }
    }
}

async function routeRequest(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (requestUrl.pathname.startsWith('/api/')) {
        await proxyApi(req, res, requestUrl);
        return;
    }
    await serveStatic(res, requestUrl.pathname);
}

async function proxyApi(req, res, requestUrl) {
    const target = buildBackendUrl(requestUrl);
    const response = await fetch(target, {
        method: req.method,
        headers: buildProxyHeaders(req.headers),
        body: await readBody(req),
    });
    // 不再 buffer 整包 —— SSE / text/event-stream 必须 chunk 透传给浏览器，
    // 否则 V2.2 流式 invoke 在代理这里被攒成同步响应。Readable.fromWeb 把 undici
    // 的 web ReadableStream 转成 Node Readable，pipe 到 res；对非流式响应等价于
    // 「分块写完后 end」，与原 buffer+end 行为一致。
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) {
        res.end();
        return;
    }
    // SSE 长连接：上游出错不能让代理裸崩；客户端关页签要顺带 destroy 上游，
    // 否则 undici 的 ReadableStream 读取悬挂、底层 socket 泄漏。
    const upstream = Readable.fromWeb(response.body);
    upstream.on('error', () => res.destroy());
    res.on('close', () => upstream.destroy());
    upstream.pipe(res);
}

function buildBackendUrl(requestUrl) {
    const target = new URL(requestUrl.pathname.replace(/^\/api/u, ''), BACKEND_URL);
    target.search = requestUrl.search;
    return target;
}

function buildProxyHeaders(headers) {
    const nextHeaders = { ...headers };
    delete nextHeaders.host;
    delete nextHeaders.connection;
    delete nextHeaders['content-length'];
    return nextHeaders;
}

async function readBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') {
        return undefined;
    }
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function serveStatic(res, pathname) {
    const filePath = resolveStaticPath(pathname);
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'content-type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
}

function resolveStaticPath(pathname) {
    const safePath = pathname === '/' ? '/index.html' : pathname;
    const resolved = path.resolve(ROOT_DIR, `.${decodeURIComponent(safePath)}`);
    if (!resolved.startsWith(ROOT_DIR)) {
        throw Object.assign(new Error('Invalid path'), { status: 403 });
    }
    return resolved;
}

function sendError(res, err) {
    const status = err.status || (err.code === 'ENOENT' ? 404 : 502);
    const message = status === 404 ? 'Not found' : err.message || 'WEBUI server error';
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(message);
}
