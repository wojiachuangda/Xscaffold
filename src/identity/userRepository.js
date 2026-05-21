// [refactor] ID: V2.5-MT | Date: 2026-05-21 | Description: User 数据访问层（async 契约；SQL 仅此文件；AA-SEAC §3 约束 4）
'use strict';

const crypto = require('crypto');

const { getDb } = require('../infrastructure/database/connection');
const { ConflictError } = require('../infrastructure/errors/AppError');

function rowToEntity(row) {
    if (!row) {
        return null;
    }
    return { id: row.id, name: row.name, email: row.email, status: row.status, createdAt: row.created_at };
}

function generateId() {
    return `user_${crypto.randomBytes(8).toString('hex')}`;
}

async function findById(driver, id) {
    const { rows } = await driver.query('SELECT * FROM users WHERE id = ?', [id]);
    return rowToEntity(rows[0]);
}

async function findByEmail(driver, email) {
    const { rows } = await driver.query('SELECT * FROM users WHERE email = ?', [email]);
    return rowToEntity(rows[0]);
}

async function create(driver, input) {
    const id = generateId();
    try {
        await driver.run('INSERT INTO users (id, name, email, status) VALUES (?, ?, ?, ?)', [
            id,
            input.name,
            input.email,
            input.status ?? 'active',
        ]);
    } catch (err) {
        if (driver.isUniqueViolation(err)) {
            throw new ConflictError(`邮箱已存在: ${input.email}`);
        }
        throw err;
    }
    return findById(driver, id);
}

function buildUserRepository(driverOrUndefined) {
    const driver = driverOrUndefined || getDb();
    return {
        findById: (id) => findById(driver, id),
        findByEmail: (email) => findByEmail(driver, email),
        create: (input) => create(driver, input),
    };
}

module.exports = { buildUserRepository };
