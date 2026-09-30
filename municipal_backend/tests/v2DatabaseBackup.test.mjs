import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createV2DatabaseBackup } from '../services/v2DatabaseBackup.js';

const config = { database: 'v2_backup_test', username: 'backup-user', password: 'secret-test-password', host: '127.0.0.1', port: 33317 };

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'impbbms-v2-backup-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function fakeDump({ sql = '-- SQL backup\nCREATE TABLE example (id INT);\n', code = 0, error, streamError } = {}, inspect = () => {}) {
  return (...args) => {
    inspect(...args);
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
      child.stdout.destroy();
      child.stderr.destroy();
      child.emit('close', null, 'SIGTERM');
      return true;
    };
    setImmediate(() => {
      if (error) {
        child.stdout.end();
        child.stderr.end();
        child.emit('error', error);
        child.emit('close', -1, null);
      } else if (streamError) {
        child.stdout.destroy(streamError);
      } else {
        child.stdout.end(sql);
        child.stderr.end(code ? config.password : '');
        child.emit('close', code, null);
      }
    });
    return child;
  };
}

test('backup streams SQL, uses private file mode, and hashes the actual completed file', async (t) => {
  const backupDirectory = await temporaryDirectory(t);
  const sql = '-- SQL backup\nCREATE DATABASE v2_backup_test;\n';
  const result = await createV2DatabaseBackup({ config, backupDirectory, mysqldumpPath: '/mysql/bin/mysqldump' }, {
    spawnProcess: fakeDump({ sql }, (executable, args, options) => {
      assert.equal(executable, '/mysql/bin/mysqldump');
      assert.equal(args[0], '--no-defaults');
      for (const flag of ['--single-transaction', '--hex-blob', '--routines', '--triggers', '--events', '--no-tablespaces', '--databases']) {
        assert.ok(args.includes(flag), flag);
      }
      assert.equal(args.at(-1), config.database);
      assert.ok(!args.some(arg => arg.includes(config.password)));
      assert.equal(options.env.MYSQL_PWD, config.password);
      assert.equal(options.shell, false);
      assert.equal(options.windowsHide, true);
    }),
  });
  assert.equal(await readFile(result.path, 'utf8'), sql);
  assert.equal(result.bytes, Buffer.byteLength(sql));
  assert.equal(result.sha256, createHash('sha256').update(sql).digest('hex'));
  assert.equal(path.dirname(result.path), backupDirectory);
  if (process.platform !== 'win32') assert.equal((await stat(result.path)).mode & 0o777, 0o600);
});

test('nonzero dump exit removes the partial backup and does not expose stderr', async (t) => {
  const backupDirectory = await temporaryDirectory(t);
  await assert.rejects(createV2DatabaseBackup({ config, backupDirectory }, { spawnProcess: fakeDump({ code: 2 }) }), error => {
    assert.match(error.message, /backup failed/);
    assert.ok(!error.message.includes(config.password));
    return true;
  });
  assert.deepEqual(await readdir(backupDirectory), []);
});

test('spawn errors remove incomplete files without leaking child errors', async (t) => {
  const backupDirectory = await temporaryDirectory(t);
  for (const spawnProcess of [
    fakeDump({ error: new Error(config.password) }),
    () => { throw new Error(config.password); },
  ]) {
    await assert.rejects(createV2DatabaseBackup({ config, backupDirectory }, { spawnProcess }), error => {
      assert.ok(!error.message.includes(config.password));
      return true;
    });
    assert.deepEqual(await readdir(backupDirectory), []);
  }
});

test('stream failures stop the dump and remove its incomplete output', async (t) => {
  const backupDirectory = await temporaryDirectory(t);
  await assert.rejects(createV2DatabaseBackup({ config, backupDirectory }, { spawnProcess: fakeDump({ streamError: new Error('pipe failed') }) }), /backup failed/);
  assert.deepEqual(await readdir(backupDirectory), []);
});

test('an empty successful dump cannot authorize a reset', async (t) => {
  const backupDirectory = await temporaryDirectory(t);
  await assert.rejects(createV2DatabaseBackup({ config, backupDirectory }, { spawnProcess: fakeDump({ sql: '' }) }), /empty V2 backup/);
  assert.deepEqual(await readdir(backupDirectory), []);
});

test('backup rejects repository paths, relative paths, and unsafe database names before spawn', async () => {
  const spawnProcess = () => { assert.fail('invalid configuration must not launch mysqldump'); };
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  await assert.rejects(createV2DatabaseBackup({ config, backupDirectory: repository }, { spawnProcess }), /outside the repository/);
  await assert.rejects(createV2DatabaseBackup({ config, backupDirectory: './backups' }, { spawnProcess }), /absolute path/);
  await assert.rejects(createV2DatabaseBackup({ config: { ...config, database: '--all-databases' }, backupDirectory: os.tmpdir() }, { spawnProcess }), /valid database name/);
});
