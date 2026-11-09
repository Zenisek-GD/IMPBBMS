import "../config/env.js";
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import mysql from "mysql2/promise";

// Restore-test the recovery backup only in a newly created disposable schema.
// Never send the dump's CREATE DATABASE / USE directives to the live schema.
const scratch = `impbbms_recovery_restore_${randomBytes(8).toString("hex")}`;
let admin, restoreConnection, sequelize, created = false;
try {
  const { values } = parseArgs({ options: { baseline: { type: "string" }, output: { type: "string" } } });
  if (!values.baseline || !values.output) throw new Error("Specify --baseline and --output private report paths.");
  const evidence = JSON.parse(await readFile(values.baseline, "utf8"));
  if (evidence.database !== process.env.DB_NAME || !/^[A-Za-z0-9_]+$/.test(evidence.database)) throw new Error("The backup baseline must match the configured application database.");
  if (!["127.0.0.1", "localhost", "::1"].includes(process.env.DB_HOST ?? "127.0.0.1")) throw new Error("Backup rehearsal is restricted to the local database server.");
  const backup = await readFile(evidence.backup.path);
  if (createHash("sha256").update(backup).digest("hex") !== evidence.backup.sha256) throw new Error("The backup checksum does not match its baseline.");
  const quotedSource = `\`${evidence.database}\``;
  let sql = backup.toString("utf8").split(/\r?\n/).filter((line) => {
    if (line.startsWith("CREATE DATABASE ")) {
      if (!line.includes(quotedSource)) throw new Error("Unexpected database directive in the backup.");
      return false;
    }
    if (line.startsWith("USE ")) {
      if (line !== `USE ${quotedSource};`) throw new Error("Unexpected USE directive in the backup.");
      return false;
    }
    return true;
  }).join("\n");
  if (/\b(?:CREATE|DROP|ALTER)\s+DATABASE\b|^USE\s|^DELIMITER\s/m.test(sql) || sql.includes(quotedSource + ".")) throw new Error("The dump contains an unsupported database-qualified statement; rehearsal refused.");
  const config = { host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER ?? "root", password: process.env.DB_PASSWORD ?? "" };
  admin = await mysql.createConnection(config);
  assertScratch();
  await admin.query(`CREATE DATABASE \`${scratch}\``); created = true;
  restoreConnection = await mysql.createConnection({ ...config, database: scratch, multipleStatements: true });
  await restoreConnection.query(sql);
  await restoreConnection.end(); restoreConnection = null; sql = null;
  process.env.DB_NAME = scratch;
  const verification = await import("../services/procurementRecoveryVerification.js");
  ({ sequelize } = await import("../models/db.js"));
  const result = await verification.verifyRecoveryBaseline(evidence.baseline);
  if (!result.existingRowsPreserved || Object.keys(result.rowCountChanges).length) throw new Error("Restored backup data does not match the original baseline.");
  const report = { status: "passed", verifiedAt: new Date().toISOString(), originalDatabase: evidence.database, disposableDatabase: scratch, backup: evidence.backup, tablesCompared: Object.keys(evidence.baseline).length, existingRowsPreserved: true, tableCountsAndFieldSignaturesMatch: true };
  await writeFile(values.output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, tablesCompared: report.tablesCompared, tableCountsAndFieldSignaturesMatch: true, reportPath: values.output }, null, 2));
} catch (error) {
  // Driver errors can contain dumped row values. Keep diagnostics bounded to
  // the error category and avoid emitting dump text or private record contents.
  console.error(error.code ? `Backup rehearsal failed (${error.code}).` : error.message);
  process.exitCode = 1;
} finally {
  await restoreConnection?.end().catch(() => {});
  await sequelize?.close().catch(() => {});
  if (created) { assertScratch(); await admin.query(`DROP DATABASE \`${scratch}\``); }
  await admin?.end();
}
function assertScratch() {
  if (!/^impbbms_recovery_restore_[a-f0-9]{16}$/.test(scratch)) throw new Error("Invalid disposable backup-rehearsal schema.");
}
