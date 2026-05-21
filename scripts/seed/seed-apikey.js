// [tooling] ID: DEV-SEED-APIKEY | Date: 2026-05-21 | Description: 开发用 API Key 种子脚本——为 dev 默认用户签发一把明文 key（仅此一次打印），用于 X-API-Key 联调多租户
'use strict';

const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const { generateApiKey, hashApiKey } = require('../../src/identity/keyUtil');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'data.db');
const DEV_USER_ID = 'user_dev_default';
const KEY_NAME = 'dev-cli-key';

function genKeyId() {
    return `key_${crypto.randomBytes(8).toString('hex')}`;
}

function ensureDevUser(db) {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(DEV_USER_ID);
    if (existing) {
        return;
    }
    db.prepare("INSERT INTO users (id, name, email, status) VALUES (?, ?, ?, 'active')").run(
        DEV_USER_ID,
        'dev-default',
        'dev@xscaffold.local',
    );
}

function main() {
    const db = new Database(DB_PATH);
    try {
        ensureDevUser(db);
        const rawKey = generateApiKey();
        db.prepare("INSERT INTO api_keys (id, user_id, key_hash, name, status) VALUES (?, ?, ?, ?, 'active')").run(
            genKeyId(),
            DEV_USER_ID,
            hashApiKey(rawKey),
            KEY_NAME,
        );
        process.stdout.write(`issued API key for ${DEV_USER_ID} into ${DB_PATH}\n`);
        process.stdout.write('  只此一次明文打印，请妥善保存：\n');
        process.stdout.write(`  X-API-Key: ${rawKey}\n`);
    } finally {
        db.close();
    }
}

main();
