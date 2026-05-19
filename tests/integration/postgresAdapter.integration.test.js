// [test] ID: V1.5-A.2 | Date: 2026-05-19 | Description: PG driver 集成测试——需真实 PG 环境（PG_TEST_URL）；无该环境时整 suite skip
'use strict';

const { createDriver, parseDatabaseUrl } = require('../../src/infrastructure/database/drivers');
const { migrate } = require('../../src/infrastructure/database/migrate');
const agentRepository = require('../../src/agentManager/agentRepository');
const ioorRepository = require('../../src/observability/ioorRepository');
const { ConflictError } = require('../../src/infrastructure/errors/AppError');

const PG_URL = process.env.PG_TEST_URL;
const describeIfPg = PG_URL ? describe : describe.skip;

describeIfPg('PostgreSQL Driver 集成测试', () => {
    let driver;

    beforeAll(async () => {
        const config = parseDatabaseUrl(PG_URL);
        driver = createDriver(config);
        // 清场：删可能残留的 schema 对象，按依赖关系倒序
        await driver.exec(`
            DROP TABLE IF EXISTS external_agent_calls;
            DROP TABLE IF EXISTS pa_reminders;
            DROP TABLE IF EXISTS pa_events;
            DROP TABLE IF EXISTS pa_tasks;
            DROP TABLE IF EXISTS projects;
            DROP TABLE IF EXISTS audit_dead_letters;
            DROP TABLE IF EXISTS ioor_records;
            DROP TABLE IF EXISTS node_traces;
            DROP TABLE IF EXISTS messages;
            DROP TABLE IF EXISTS executions;
            DROP TABLE IF EXISTS agents;
            DROP TABLE IF EXISTS schema_migrations;
            DROP FUNCTION IF EXISTS xs_iso_now();
        `);
        await migrate({ driver });
    });

    afterAll(async () => {
        if (driver) {
            await driver.close();
        }
    });

    test('migrate 应用全部 8 个 PG 迁移（含 000 helper）', async () => {
        const { rows } = await driver.query('SELECT id FROM schema_migrations ORDER BY id');
        const ids = rows.map((r) => r.id);
        expect(ids).toContain('000_init_helpers.sql');
        expect(ids).toContain('007_create_external_agent_calls.sql');
        expect(ids.length).toBe(8);
    });

    test('xs_iso_now() 输出格式与 SQLite ISO 等价', async () => {
        const { rows } = await driver.query('SELECT xs_iso_now() AS ts');
        expect(rows[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('agent UNIQUE 冲突触发 ConflictError', async () => {
        await agentRepository.create(driver, { name: 'pg-conflict-test', model: 'gpt-4', tools: [] });
        await expect(
            agentRepository.create(driver, { name: 'pg-conflict-test', model: 'gpt-4', tools: [] }),
        ).rejects.toBeInstanceOf(ConflictError);
    });

    test('IOOR JSONB 字段往返一致（写入对象 → 读取等值对象）', async () => {
        const record = {
            executionId: 'exec-pg-1',
            nodeId: 'n1',
            turnIndex: 0,
            agentId: null,
            profileHash: null,
            modelProvider: 'openai',
            modelName: 'gpt-4',
            input: { messages: [{ role: 'user', content: 'hi' }], temperature: 0.7 },
            output: { content: 'hello', finishReason: 'stop' },
            toolCalls: [{ name: 'search', args: { q: 'pg' } }],
            observations: [{ result: 'ok' }],
            tokenUsage: { prompt: 10, completion: 5 },
            latencyMs: 123,
        };
        const inserted = await ioorRepository.insertRecord(driver, record);
        expect(inserted.input).toEqual(record.input);
        expect(inserted.output).toEqual(record.output);
        expect(inserted.toolCalls).toEqual(record.toolCalls);
        expect(inserted.observations).toEqual(record.observations);
        expect(inserted.tokenUsage).toEqual(record.tokenUsage);
    });

    test('JSONB 列在 PG 元数据中为 jsonb 类型', async () => {
        const { rows } = await driver.query(
            `SELECT column_name, data_type FROM information_schema.columns
             WHERE table_name = 'ioor_records' AND column_name IN ('input', 'output', 'tool_calls', 'observations', 'token_usage')`,
        );
        rows.forEach((r) => {
            expect(r.data_type).toBe('jsonb');
        });
        expect(rows.length).toBe(5);
    });

    test('GIN 索引就位（AA-SEAC §4.3）', async () => {
        const { rows } = await driver.query(
            `SELECT indexname FROM pg_indexes WHERE tablename = 'ioor_records' AND indexname LIKE '%_gin'`,
        );
        const names = rows.map((r) => r.indexname).sort();
        expect(names).toEqual([
            'idx_ioor_input_gin',
            'idx_ioor_observations_gin',
            'idx_ioor_output_gin',
            'idx_ioor_tool_calls_gin',
        ]);
    });

    test('transaction 内抛错触发 ROLLBACK（外部观察不到中间写入）', async () => {
        const probeName = `pg-txn-rollback-${Date.now()}`;
        await expect(
            driver.transaction(async (trx) => {
                await agentRepository.create(trx, { name: probeName, model: 'gpt-4', tools: [] });
                throw new Error('故意失败');
            }),
        ).rejects.toThrow('故意失败');

        const { rows } = await driver.query('SELECT id FROM agents WHERE name = ?', [probeName]);
        expect(rows.length).toBe(0);
    });

    test('transaction 正常 COMMIT 持久化写入', async () => {
        const probeName = `pg-txn-commit-${Date.now()}`;
        await driver.transaction(async (trx) => {
            await agentRepository.create(trx, { name: probeName, model: 'gpt-4', tools: ['t1', 't2'] });
        });
        const { rows } = await driver.query('SELECT name, tools FROM agents WHERE name = ?', [probeName]);
        expect(rows.length).toBe(1);
        expect(JSON.parse(rows[0].tools)).toEqual(['t1', 't2']);
    });
});
