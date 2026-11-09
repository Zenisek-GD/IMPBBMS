import "../config/env.js";
import { parseArgs } from "node:util";
import path from "node:path";
import { sequelize } from "../models/index.js";
import { createSystemBackup } from "../services/backupEngine.js";
import { ensureBackupStorageDirectory, getBackupStorageDirectory } from "../services/backupScheduler.js";

try {
  const { values } = parseArgs({
    options: {
      output: { type: "string" },
      directory: { type: "string" },
      label: { type: "string", default: "cli-backup" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(`
IMPBBMS System Backup CLI
Usage:
  node scripts/backupSystem.mjs [options]
  npm run backup:system -- [options]

Options:
  --directory <dir>   Target directory for the backup package (.tar.gz)
  --label <label>     Custom descriptive label for the backup
  -h, --help          Show this help message
`);
    process.exit(0);
  }

  const backupDir = values.directory ? path.resolve(values.directory) : await ensureBackupStorageDirectory();
  console.log(`[backup] Starting complete system backup for database: ${sequelize.config.database}...`);
  console.log(`[backup] Target directory: ${backupDir}`);

  const backup = await createSystemBackup({
    config: sequelize.config,
    backupDirectory: backupDir,
    label: values.label,
    createdBy: { id: null, name: "CLI Operator", role: "systemAdministrator" },
  });

  console.log("\n========================================================");
  console.log("✅ SYSTEM BACKUP COMPLETED SUCCESSFULLY");
  console.log("========================================================");
  console.log(`Package:      ${backup.filename}`);
  console.log(`Location:     ${backup.path}`);
  console.log(`File Size:    ${(backup.bytes / 1024 / 1024).toFixed(2)} MB (${backup.bytes} bytes)`);
  console.log(`SHA-256:      ${backup.sha256}`);
  console.log(`Tables:       ${backup.manifest.statistics.tableCount}`);
  console.log(`Total Rows:   ${backup.manifest.statistics.totalRows}`);
  console.log(`Documents:    ${backup.manifest.statistics.documentCount} (${(backup.manifest.statistics.documentBytes / 1024).toFixed(1)} KB)`);
  console.log(`Active Users: ${backup.manifest.statistics.userCount}`);
  console.log("========================================================\n");
} catch (error) {
  console.error("\n❌ Backup failed:", error.message);
  process.exitCode = 1;
}
