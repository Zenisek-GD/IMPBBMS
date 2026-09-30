import './config/env.js';
import { parseArgs } from 'node:util';
import { sequelize } from './models/index.js';
import { planV2Reset, applyV2Reset } from './services/v2Reset.js';
import { createV2DatabaseBackup } from './services/v2DatabaseBackup.js';
import { validateProductionConfig } from './config/security.js';

try {
  const { values } = parseArgs({ options: {
    'admin-email': { type: 'string' }, 'admin-date': { type: 'string', default: 'today' },
    apply: { type: 'boolean', default: false }, 'confirm-database': { type: 'string' },
    'maintenance-confirmed': { type: 'boolean', default: false }, 'backup-directory': { type: 'string' },
    mysqldump: { type: 'string', default: 'mysqldump' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`V2 reset (preview by default; never runs on application startup).
  npm run reset:v2 -- --admin-email EMAIL
  npm run reset:v2 -- --admin-email EMAIL --apply --confirm-database DB_NAME --maintenance-confirmed --backup-directory /absolute/private/backup/path

Retains one active system administrator, its password/MFA, and reference data.
Clears all other accounts, operational records, sessions and old audit history.
--admin-date today (default) sets createdAt to the reset time; preserve keeps it.
--mysqldump /path/to/mysqldump selects the backup executable.
Stop ALL application instances before --apply. Backup must be outside the repository.
Run migrations first. A completed reset cannot be run again.`);
  } else {
    if (process.env.CLOUDFLARE_WORKER === 'true') throw new Error('This reset targets standalone Node/MySQL on EC2; it cannot clear Cloudflare D1 sessions.');
    if (!process.env.DB_NAME) throw new Error('Set DB_NAME explicitly in the backend environment.');
    validateProductionConfig();
    const options = { adminEmail: values['admin-email'], adminDate: values['admin-date'] };
    await sequelize.authenticate();
    const plan = await planV2Reset(options);
    console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'preview (no changes)', target: {
      host: sequelize.config.host, port: sequelize.config.port, database: plan.database,
    }, administrator: plan.admin, administratorDate: plan.adminDate,
    tables: plan.rows, clearedSettings: plan.removedSettingKeys, notes: plan.notes }, null, 2));
    if (values.apply) {
      const result = await applyV2Reset({ ...options, confirmDatabase: values['confirm-database'],
        maintenanceConfirmed: values['maintenance-confirmed'], createBackup: () => createV2DatabaseBackup({
          config: sequelize.config, backupDirectory: values['backup-directory'], mysqldumpPath: values.mysqldump,
        }) });
      console.log(JSON.stringify({ status: 'V2 reset committed', ...result }, null, 2));
    }
  }
} catch (error) {
  // Driver errors can include SQL values. Do not dump a stack, config, or SQL here.
  console.error(`V2 reset failed: ${error.name?.startsWith('Sequelize') ? error.name + ' (database operation failed)' : error.message}`);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
