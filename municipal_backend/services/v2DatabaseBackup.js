import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, realpath, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const repositoryDirectory = fileURLToPath(new URL('../../', import.meta.url));

function isWithin(directory, parent) {
  const relative = path.relative(parent, directory);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

// Resolve existing ancestors before creating directories, including symlinks.
async function resolvedDestination(directory) {
  try {
    return await realpath(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(directory);
    if (parent === directory) throw error;
    return path.join(await resolvedDestination(parent), path.basename(directory));
  }
}

/**
 * Create a complete, private SQL backup before the caller deletes any data.
 * This helper never changes database data. A successful return
 * means mysqldump exited successfully and the file was flushed and hashed.
 */
export async function createV2DatabaseBackup(
  { config, backupDirectory, mysqldumpPath = 'mysqldump' },
  { spawnProcess = spawn } = {},
) {
  const database = config?.database;
  const username = config?.username ?? config?.user;
  const host = config?.host ?? '127.0.0.1';
  const port = Number(config?.port ?? 3306);
  if (typeof database !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_$-]*$/.test(database)) {
    throw new Error('A valid database name is required for the V2 backup.');
  }
  if (typeof username !== 'string' || !username || username.includes('\0')) {
    throw new Error('A database username is required for the V2 backup.');
  }
  if (typeof host !== 'string' || !host || host.includes('\0') || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('A valid database host and port are required for the V2 backup.');
  }
  if (typeof mysqldumpPath !== 'string' || !mysqldumpPath || mysqldumpPath.includes('\0')) {
    throw new Error('A valid mysqldump executable is required for the V2 backup.');
  }
  if (typeof backupDirectory !== 'string' || !path.isAbsolute(backupDirectory)) {
    throw new Error('The V2 backup directory must be an absolute path outside the repository.');
  }
  const repository = await realpath(repositoryDirectory);
  const destination = await resolvedDestination(path.resolve(backupDirectory));
  if (isWithin(destination, repository)) {
    throw new Error('The V2 backup directory must be outside the repository.');
  }
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const actualDirectory = await realpath(destination);
  if (isWithin(actualDirectory, repository)) {
    throw new Error('The V2 backup directory must be outside the repository.');
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(actualDirectory, `${database}-before-v2-${timestamp}-${randomUUID()}.sql`);
  const args = [
    '--no-defaults',
    `--host=${host}`,
    `--port=${port}`,
    `--user=${username}`,
    '--protocol=TCP',
    '--single-transaction',
    '--hex-blob',
    '--routines',
    '--triggers',
    '--events',
    '--no-tablespaces',
    '--databases',
    database,
  ];
  let file;
  let child;
  let output;
  let copied;
  let completed;
  let failureMessage = 'Unable to create the V2 database backup file.';
  try {
    file = await open(backupPath, 'wx', 0o600);
    failureMessage = 'Unable to start mysqldump for the V2 backup. Check the executable and database connection.';
    child = spawnProcess(mysqldumpPath, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MYSQL_PWD: String(config.password ?? '') },
    });
    completed = new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('mysqldump could not start.')));
      child.once('close', (code, signal) => {
        if (code === 0 && !signal) resolve();
        else reject(new Error('mysqldump did not finish successfully.'));
      });
    });
    // Drain diagnostic output without exposing credentials or SQL in logs.
    child.stderr?.on('error', () => {});
    child.stderr?.resume();
    failureMessage = 'The V2 database backup failed. Check mysqldump availability, permissions, and database connectivity; no reset should run.';
    output = createWriteStream(backupPath, { fd: file.fd, autoClose: false });
    copied = pipeline(child.stdout, output);
    await Promise.all([completed, copied]);
    await file.sync();
    await file.close();
    file = undefined;
    const { size } = await stat(backupPath);
    if (size === 0) {
      failureMessage = 'mysqldump produced an empty V2 backup; no reset should run.';
      throw new Error(failureMessage);
    }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(backupPath)) hash.update(chunk);
    return { path: backupPath, bytes: size, sha256: hash.digest('hex') };
  } catch {
    // A failed dump must never be mistaken for the backup authorizing reset.
    child?.kill();
    child?.stdout?.destroy();
    output?.destroy();
    await Promise.allSettled([completed, copied].filter(Boolean));
    await file?.close().catch(() => {});
    if (file || child) await unlink(backupPath).catch(() => {});
    // Do not include child-process errors/stderr: they may contain secrets.
    throw new Error(failureMessage);
  }
}
