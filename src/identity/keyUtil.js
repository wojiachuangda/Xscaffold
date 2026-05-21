// [scaffold] ID: V2.5-MT | Date: 2026-05-21 | Description: API key 生成与哈希——明文 sk_ 前缀高熵随机；库内只存 SHA-256（key 高熵，等价 token，无需 bcrypt）
'use strict';

const crypto = require('crypto');

function generateApiKey() {
    return `sk_${crypto.randomBytes(24).toString('hex')}`;
}

function hashApiKey(key) {
    return crypto.createHash('sha256').update(String(key)).digest('hex');
}

module.exports = { generateApiKey, hashApiKey };
