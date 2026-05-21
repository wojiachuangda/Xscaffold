// [ui] ID: WEBUI-V2.2-MD | Date: 2026-05-21 | Description: Markdown 渲染封装——marked 解析 + DOMPurify 净化，安全展示 LLM 输出（防 <script> / on*= XSS）
'use strict';

import { marked } from '../vendor/marked.esm.js';
import DOMPurify from '../vendor/dompurify.es.mjs';

marked.use({ gfm: true, breaks: true });

/**
 * 把 markdown 字符串渲染为 sanitized HTML 字符串。
 * - marked: GFM（表格 / fenced code）+ breaks（\n → <br>）
 * - DOMPurify: 默认配置即可拒绝 <script> / onclick / javascript: 等
 * 调用方应把返回的 HTML 包到 `.md-body` 容器里以获得排版样式。
 */
export function renderMarkdown(text) {
    if (text === null || text === undefined || text === '') {
        return '';
    }
    const html = marked.parse(String(text));
    return DOMPurify.sanitize(html);
}
