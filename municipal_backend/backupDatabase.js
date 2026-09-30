import './config/env.js';
import { parseArgs } from 'node:util';
import { createV2DatabaseBackup } from './services/v2DatabaseBackup.js';

try {
  const { values } = parseArgs({ options: {
    'backup-directory': { type: 'string' }, mysqldump: { type: 'string', default: 'mysqldump' },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) console.log('npm run backup:database -- --backup-directory /absolute/private/backup/path [--mysqldump /path/to/mysqldump]');
  else {
    if (!process.env.DB_NAME) throw new Error('Set DB_NAME explicitly in the backend environment.');
    const result = await createV2DatabaseBackup({ config: {
      database: process.env.DB_NAME, username: process.env.DB_USER ?? 'root', password: process.env.DB_PASSWORD ?? '',
      host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 3306),
    }, backupDirectory: values['backup-directory'], mysqldumpPath: values.mysqldump });
    console.log(JSON.stringify({ status: 'Database backup completed', ...result }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
