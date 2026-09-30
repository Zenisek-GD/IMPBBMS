import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';

const execute = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
test('V2 CLI previews, migrates, backs up, resets and restores real binary data on an isolated schema', {
  skip: process.env.RUN_PROCUREMENT_DB_TESTS !== '1' || !process.env.PROCUREMENT_TEST_MYSQLDUMP || !process.env.PROCUREMENT_TEST_MYSQL,
  timeout: 180000,
}, async t => {
  const scratch = `impbbms_v2_cli_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.PROCUREMENT_TEST_DB_PORT ?? 33317);
  const database = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
  await database.query(`CREATE DATABASE \`${scratch}\``);
  await database.query(`USE \`${scratch}\``);
  const backupDirectory = await mkdtemp(path.join(os.tmpdir(), 'impbbms-v2-cli-backup-'));
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: scratch, DB_USER: 'root',
    DB_PASSWORD: '', NODE_ENV: 'test', CLOUDFLARE_WORKER: 'false', MFA_ENCRYPTION_KEY: 'v2-cli-test-only-encryption-key' });
  let m;
  t.after(async () => {
    if (m) await m.sequelize.close();
    assert.match(scratch, /^impbbms_v2_cli_[a-f0-9]{16}$/);
    await database.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
    await database.end();
    assert.equal(path.dirname(backupDirectory), os.tmpdir());
    assert.match(path.basename(backupDirectory), /^impbbms-v2-cli-backup-/);
    await rm(backupDirectory, { recursive: true, force: true });
  });
  m = await import('../models/index.js');
  await m.sequelize.sync();
  const role = await m.Role.create({ key: 'systemAdministrator', name: 'System Administrator' });
  const originalDate = new Date('2026-01-01T00:00:00Z');
  const retained = await m.User.create({ name: 'Kept', email: 'kept@example.test', password: 'TestOnlyPassword!123', roleId: role.id, createdAt: originalDate });
  const removed = await m.User.create({ name: 'Removed', email: 'removed@example.test', password: 'TestOnlyPassword!123', roleId: role.id });
  const content = Buffer.from([0, 255, 128, 10, 13, 39, 34, 92, 0, 42]);
  await m.Document.create({ filename: 'binary-test.bin', mimeType: 'application/octet-stream', content,
    sizeBytes: content.length, checksum: crypto.createHash('sha256').update(content).digest('hex'),
    uploadedAt: originalDate, uploadedById: removed.id, entityRef: 'system', entityId: removed.id });
  // Exercise the old ENUM path through the real deployment migration entry point.
  await database.query("ALTER TABLE developmentgoals MODIFY sector ENUM('social','economic','infrastructure','environment','institutional') NOT NULL");
  const run = async (script, args = []) => (await execute(process.execPath, [script, ...args], {
    cwd: backend, env: { ...process.env }, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
  })).stdout;
  await run('backupDatabase.js', ['--backup-directory', backupDirectory, '--mysqldump', process.env.PROCUREMENT_TEST_MYSQLDUMP]);
  await run('migrate.js');
  await run('migrate.js', ['--check']);
  const [columns] = await database.query("SHOW COLUMNS FROM developmentgoals LIKE 'sector'");
  assert.ok(columns[0].Type.includes("'general'"));
  const preview = await run('resetV2.js', ['--admin-email', retained.email]);
  assert.match(preview, /preview \(no changes\)/);
  assert.equal(await m.User.count(), 2);
  assert.equal(await m.Document.count(), 1);
  const output = await run('resetV2.js', ['--admin-email', retained.email, '--apply', '--confirm-database', scratch,
    '--maintenance-confirmed', '--backup-directory', backupDirectory, '--mysqldump', process.env.PROCUREMENT_TEST_MYSQLDUMP]);
  const start = output.lastIndexOf('\n{\n  "status"');
  assert.ok(start >= 0, 'reset prints its committed result');
  const result = JSON.parse(output.slice(start));
  assert.equal(result.status, 'V2 reset committed');
  assert.equal(await m.User.count(), 1);
  assert.equal(await m.Document.count(), 0);
  const current = await retained.reload();
  assert.equal(current.createdAt.toISOString(), result.completedAt);
  const sql = await readFile(result.backup.path);
  assert.equal(sql.length, result.backup.bytes);
  assert.equal(crypto.createHash('sha256').update(sql).digest('hex'), result.backup.sha256);
  assert.ok(sql.toString().includes(`USE \`${scratch}\``));
  assert.ok(sql.toString().toUpperCase().includes(`0X${content.toString('hex').toUpperCase()}`));
  await assert.rejects(run('resetV2.js', ['--admin-email', retained.email, '--apply', '--confirm-database', scratch,
    '--maintenance-confirmed', '--backup-directory', backupDirectory, '--mysqldump', process.env.PROCUREMENT_TEST_MYSQLDUMP]), /already completed/);

  // Restore ONLY the isolated schema named by the generated dump on the test server.
  await m.sequelize.close(); m = null;
  assert.match(scratch, /^impbbms_v2_cli_[a-f0-9]{16}$/);
  await database.query(`DROP DATABASE \`${scratch}\``);
  const child = spawn(process.env.PROCUREMENT_TEST_MYSQL, ['--no-defaults', '--host=127.0.0.1', `--port=${port}`, '--user=root', '--protocol=TCP'], {
    shell: false, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'], env: { ...process.env, MYSQL_PWD: '' },
  });
  child.stderr.resume();
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Scratch backup restore failed')));
  });
  await Promise.all([pipeline(createReadStream(result.backup.path), child.stdin), completed]);
  const [users] = await database.query(`SELECT id, createdAt FROM \`${scratch}\`.users ORDER BY id`);
  assert.equal(users.length, 2);
  assert.equal(users[0].id, retained.id);
  const [documents] = await database.query(`SELECT content FROM \`${scratch}\`.documents`);
  assert.deepEqual(documents[0].content, content);
  const [markers] = await database.query(`SELECT id FROM \`${scratch}\`.systemsettings WHERE \`key\` = 'deployment.v2.reset'`);
  assert.equal(markers.length, 0);
});
