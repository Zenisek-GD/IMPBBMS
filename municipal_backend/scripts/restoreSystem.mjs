import "../config/env.js";
import { parseArgs } from "node:util";
import path from "node:path";
import readline from "node:readline/promises";
import { sequelize } from "../models/index.js";
import { inspectSystemBackup, restoreSystemBackup } from "../services/backupEngine.js";
import { ensureBackupStorageDirectory } from "../services/backupScheduler.js";
import { rebaseline } from "../services/integrityMonitor.js";

try {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      database: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || !values.file) {
    console.log(`
IMPBBMS System Restoration & Deployment Migration CLI
Usage:
  node scripts/restoreSystem.mjs --file <path-to-tar.gz> [options]
  npm run restore:system -- --file <path-to-tar.gz> [options]

Options:
  --file <path>       Absolute or relative path to .tar.gz backup package (required)
  --database <name>   Target database name (defaults to DB_NAME from .env)
  --dry-run           Inspect and validate package without modifying database
  --force             Proceed without interactive prompt
  -h, --help          Show this help message
`);
    process.exit(values.help ? 0 : 1);
  }

  const backupFilePath = path.resolve(values.file);
  const targetDb = values.database || sequelize.config.database;

  console.log(`[restore] Inspecting backup package: ${backupFilePath}...`);
  const inspection = await inspectSystemBackup(backupFilePath, { ...sequelize.config, database: targetDb });

  const m = inspection.manifest;
  console.log("\n========================================================");
  console.log("BACKUP PACKAGE PREVIEW");
  console.log("========================================================");
  console.log(`Application:      ${m.source.app} (Version ${m.source.appVersion})`);
  console.log(`Created At:       ${m.createdAt} (${m.label})`);
  console.log(`Source Database:  ${m.source.databaseName}`);
  console.log(`LGU Profile:      ${m.source.lguProfile?.lguName ?? "N/A"} (${m.source.lguProfile?.incomeClass ?? "N/A"})`);
  console.log(`SQL Dump Size:    ${(inspection.sqlBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Table Count:      ${m.statistics.tableCount}`);
  console.log(`Total Rows:       ${m.statistics.totalRows}`);
  console.log(`Documents:        ${m.statistics.documentCount} (${(m.statistics.documentBytes / 1024).toFixed(1)} KB)`);
  console.log(`Active Users:     ${m.statistics.userCount}`);
  console.log(`Target Database:  ${targetDb}`);
  console.log("========================================================\n");

  if (values["dry-run"]) {
    console.log("✅ Dry-run inspection passed. No changes were made to the database.");
    process.exit(0);
  }

  if (!values.force) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`⚠️  WARNING: Restoring will overwrite existing tables in '${targetDb}'.`);
    console.log("A pre-restore safety snapshot will be automatically saved before applying changes.");
    const answer = await rl.question(`Type '${targetDb}' to confirm and proceed: `);
    rl.close();

    if (answer.trim() !== targetDb && answer.trim() !== "RESTORE") {
      console.log("Restoration aborted by user.");
      process.exit(0);
    }
  }

  console.log(`\n[restore] Executing data restoration into '${targetDb}'...`);
  const storageDir = await ensureBackupStorageDirectory();

  const report = await restoreSystemBackup({
    backupPathOrBuffer: backupFilePath,
    config: sequelize.config,
    targetDatabase: targetDb,
    safetyBackupDirectory: storageDir,
    restoredBy: { id: null, name: "CLI Operator", role: "systemAdministrator" },
    onProgress: (current, total) => {
      process.stdout.write(`\r[restore] Progress: ${current}/${total} statements executed...`);
    },
    rebaselineHook: async () => {
      try {
        console.log("\n[restore] Synchronizing integrity monitoring baseline...");
        await rebaseline();
      } catch (err) {
        console.warn("[restore] Integrity baseline warning:", err.message);
      }
    },
  });

  if (!report.success || report.mismatchCount > 0) {
    console.error("\n========================================================");
    console.error(`❌ RESTORATION VERIFICATION FAILED: ${report.mismatchCount} table row count mismatch(es) detected.`);
    console.error("========================================================");
    for (const d of report.tableDetails.filter((t) => t.status === "mismatch")) {
      console.error(`  - Table \`${d.table}\`: expected ${d.expectedRows} rows, found ${d.restoredRows} rows`);
    }
    if (report.safetyBackupPath) {
      console.error(`Safety rollback snapshot is available at: ${report.safetyBackupPath}`);
    }
    console.error("========================================================\n");
    process.exit(1);
  }

  console.log("\n========================================================");
  console.log("✅ SYSTEM RESTORATION COMPLETED SUCCESSFULLY");
  console.log("========================================================");
  console.log(`Restored At:       ${report.restoredAt}`);
  console.log(`Target Database:   ${report.targetDatabase}`);
  console.log(`Tables Restored:   ${report.tablesRestored}`);
  console.log(`Total Rows:        ${report.totalRowsRestored}`);
  console.log(`Verified Docs:     ${report.verifiedDocuments}`);
  if (report.safetyBackupPath) {
    console.log(`Safety Backup:     ${report.safetyBackupPath}`);
  }
  console.log("========================================================\n");
} catch (error) {
  console.error("\n❌ Restoration failed:", error.message);
  if (error.safetyBackupPath) {
    console.error(`Safety rollback snapshot saved at: ${error.safetyBackupPath}`);
  }
  process.exitCode = 1;
}
