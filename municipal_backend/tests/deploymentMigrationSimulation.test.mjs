import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import "../config/env.js";
import { sequelize } from "../models/db.js";
import { createSystemBackup, inspectSystemBackup, restoreSystemBackup } from "../services/backupEngine.js";

const sourceConfig = {
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "municipal_backend",
};

const MIGRATED_TARGET_DB = "impbbms_migrated_production_test";

async function cleanupMigratedDb() {
  const root = await mysql.createConnection({
    host: sourceConfig.host,
    port: sourceConfig.port,
    user: sourceConfig.user,
    password: sourceConfig.password,
  });
  await root.query(`DROP DATABASE IF EXISTS \`${MIGRATED_TARGET_DB}\``);
  await root.end();
}

test("Requirement 7: Real Deployment Migration Simulation (End-to-End Verification)", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-migration-simulation-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await cleanupMigratedDb();
  });

  console.log("\n========================================================");
  console.log("SIMULATING REAL PRODUCTION DEPLOYMENT MIGRATION");
  console.log("========================================================");

  // Step 1: Start with working application containing realistic test data
  const sourceConn = await mysql.createConnection(sourceConfig);
  const [sourceTables] = await sourceConn.query("SHOW TABLES");
  assert.equal(sourceTables.length, 69, "Source database must contain all 69 core tables");

  // Insert test document to verify binary file migration
  const contractPdf = Buffer.from("%PDF-1.4\nContract Document: Municipal Drainage Infrastructure Project 2026\n%%EOF");
  const contractChecksum = crypto.createHash("sha256").update(contractPdf).digest("hex");
  const [insDoc] = await sourceConn.query(
    "INSERT INTO `documents` (`filename`, `mimeType`, `sizeBytes`, `content`, `checksum`, `entityRef`, `entityId`, `docType`, `label`, `uploadedAt`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
    ["contract-2026-drainage.pdf", "application/pdf", contractPdf.length, contractPdf, contractChecksum, "contract", 8888, "contract", "Drainage Contract"]
  );
  const testDocId = insDoc.insertId;
  await sourceConn.end();

  t.after(async () => {
    const cleanConn = await mysql.createConnection(sourceConfig);
    await cleanConn.query("DELETE FROM `documents` WHERE id = ?", [testDocId]);
    await cleanConn.end();
  });

  // Step 2: Create and download a complete backup
  console.log("[migration-sim] Step 2: Creating complete system backup package...");
  const backup = await createSystemBackup({
    config: sourceConfig,
    backupDirectory: tempDir,
    label: "production-migration-snapshot",
    createdBy: { id: 1, name: "System Administrator", role: "systemAdministrator" },
  });

  assert.ok(backup.path);
  assert.ok(backup.bytes > 0);
  console.log(`[migration-sim] Package created: ${backup.filename} (${Math.round(backup.bytes / 1024)} KB)`);

  // Step 3: Initialize a separate, fresh deployment environment
  console.log(`[migration-sim] Step 3: Initializing fresh isolated environment '${MIGRATED_TARGET_DB}'...`);
  await cleanupMigratedDb();
  const root = await mysql.createConnection({
    host: sourceConfig.host,
    port: sourceConfig.port,
    user: sourceConfig.user,
    password: sourceConfig.password,
  });
  await root.query(`CREATE DATABASE \`${MIGRATED_TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();

  // Verify empty target DB
  const checkEmptyConn = await mysql.createConnection({ ...sourceConfig, database: MIGRATED_TARGET_DB });
  const [emptyTables] = await checkEmptyConn.query("SHOW TABLES");
  assert.equal(emptyTables.length, 0, "Target database must start completely empty");
  await checkEmptyConn.end();

  // Step 4: Configure environment and dry-run inspect package
  console.log("[migration-sim] Step 4: Inspecting package in target environment...");
  const inspection = await inspectSystemBackup(backup.path, { ...sourceConfig, database: MIGRATED_TARGET_DB });
  assert.equal(inspection.valid, true);
  assert.equal(inspection.manifest.statistics.tableCount, 69);
  assert.ok(inspection.manifest.statistics.totalRows > 0);

  // Step 5: Import previous backup into fresh environment
  console.log(`[migration-sim] Step 5: Restoring backup into '${MIGRATED_TARGET_DB}'...`);
  const report = await restoreSystemBackup({
    backupPathOrBuffer: backup.path,
    config: sourceConfig,
    targetDatabase: MIGRATED_TARGET_DB,
    safetyBackupDirectory: tempDir,
    restoredBy: { id: null, name: "Bootstrap Migration Operator" },
  });

  assert.equal(report.success, true);
  assert.equal(report.mismatchCount, 0);
  assert.equal(report.tablesRestored, 69);
  console.log(`[migration-sim] Restored ${report.tablesRestored} tables and ${report.totalRowsRestored} rows.`);

  // Step 6: Verify all restored records, relationships, files, and relevant settings
  console.log("[migration-sim] Step 6: Verifying restored records, foreign keys, files, and settings...");
  const migratedConn = await mysql.createConnection({ ...sourceConfig, database: MIGRATED_TARGET_DB });

  // Verify LGU profile system settings
  const [settings] = await migratedConn.query("SELECT `key`, `value` FROM `systemsettings` WHERE `key` IN ('lgu.name', 'lgu_name')");
  assert.ok(settings.length > 0);
  console.log(`[migration-sim] Restored LGU Profile: ${settings[0].value}`);

  // Verify document byte fidelity
  const [[migratedDoc]] = await migratedConn.query("SELECT id, filename, content, checksum, sizeBytes FROM `documents` WHERE id = ?", [testDocId]);
  assert.ok(migratedDoc);
  assert.equal(migratedDoc.filename, "contract-2026-drainage.pdf");
  assert.equal(migratedDoc.checksum, contractChecksum);
  assert.equal(Buffer.compare(migratedDoc.content, contractPdf), 0, "Migrated document bytes match 100%");
  console.log(`[migration-sim] Verified document '${migratedDoc.filename}' (${migratedDoc.sizeBytes} bytes, SHA-256 matched)`);

  // Step 7: Log in using restored test accounts
  console.log("[migration-sim] Step 7: Testing authentication with restored accounts...");
  const testAccounts = [
    { email: "systemadministrator@procurenance.com", expectedRole: "systemAdministrator" },
    { email: "hope@procurenance.com", expectedRole: "hope" },
    { email: "bacsecretariat@procurenance.com", expectedRole: "bacSecretariat" },
    { email: "budgetofficer@procurenance.com", expectedRole: "budgetOfficer" },
    { email: "vendor@procurenance.com", expectedRole: "vendor" },
  ];

  for (const acc of testAccounts) {
    const [rows] = await migratedConn.query(
      "SELECT u.id, u.email, u.password, u.status, r.name as roleName FROM `users` u JOIN `roles` r ON u.roleId = r.id WHERE u.email = ?",
      [acc.email]
    );
    assert.equal(rows.length, 1, `Account ${acc.email} must exist in migrated database`);
    const valid = await bcrypt.compare("Passw0rd!", rows[0].password);
    assert.equal(valid, true, `Password authentication for ${acc.email} must succeed`);
    assert.equal(rows[0].status, "active");
    console.log(`  - Account verified: ${acc.email} (${rows[0].roleName}, active, bcrypt authentication OK)`);
  }

  // Step 8: Test important application functions
  console.log("[migration-sim] Step 8: Testing application query workflows on migrated database...");
  const [[deptCount]] = await migratedConn.query("SELECT COUNT(*) as cnt FROM `departments`");
  const [[planCount]] = await migratedConn.query("SELECT COUNT(*) as cnt FROM `developmentplans`");
  const [[auditCount]] = await migratedConn.query("SELECT COUNT(*) as cnt FROM `auditlogs`");
  assert.ok(Number(deptCount.cnt) > 0);
  assert.ok(Number(planCount.cnt) > 0);
  assert.ok(Number(auditCount.cnt) > 0);
  console.log(`[migration-sim] Application functions verified: ${deptCount.cnt} departments, ${planCount.cnt} development plans, ${auditCount.cnt} audit log entries.`);

  // Step 9: Create, update, and retrieve records after restoration
  console.log("[migration-sim] Step 9: Creating, updating, and retrieving new records post-restoration...");
  const [[maxDept]] = await migratedConn.query("SELECT MAX(id) as maxId FROM `departments`");
  const prevMaxId = Number(maxDept.maxId);

  // Create new department
  const [insNewDept] = await migratedConn.query(
    "INSERT INTO `departments` (`name`, `code`, `status`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, NOW(), NOW())",
    ["Migrated Municipal Health Office", "MHO-MIGRATED", "active"]
  );
  const newDeptId = insNewDept.insertId;
  assert.equal(newDeptId, prevMaxId + 1, "Auto-increment sequentially advances");

  // Create new user in that department
  const hashedPassword = await bcrypt.hash("Passw0rd!", 10);
  const [insNewUser] = await migratedConn.query(
    "INSERT INTO `users` (`name`, `email`, `password`, `roleId`, `departmentId`, `status`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
    ["Dr. Elena Santos", "mho.officer@procurenance.com", hashedPassword, 8, newDeptId, "active"]
  );
  const newUserId = insNewUser.insertId;
  assert.ok(newUserId > 0);

  // Create new Purchase Requisition header
  const [insPr] = await migratedConn.query(
    "INSERT INTO `prheaders` (`prNumber`, `departmentId`, `purpose`, `dateRequired`, `status`, `totalAmount`, `requesterId`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())",
    ["PR-2026-MIGRATED-001", newDeptId, "Emergency Medical Supplies for New Health Office", "2026-12-01", "draft", 150000.00, newUserId]
  );
  const newPrId = insPr.insertId;

  // Update PR record
  await migratedConn.query("UPDATE `prheaders` SET `status` = 'pendingDepartmentHeadEndorsement', `purpose` = 'Updated Emergency Medical Supplies' WHERE id = ?", [newPrId]);

  // Retrieve PR and verify
  const [[retrievedPr]] = await migratedConn.query("SELECT * FROM `prheaders` WHERE id = ?", [newPrId]);
  assert.equal(retrievedPr.prNumber, "PR-2026-MIGRATED-001");
  assert.equal(retrievedPr.status, "pendingDepartmentHeadEndorsement");
  assert.equal(retrievedPr.purpose, "Updated Emergency Medical Supplies");
  console.log(`[migration-sim] Successfully created, updated, and retrieved PR #${retrievedPr.id} (${retrievedPr.prNumber})`);

  // Step 10: Confirm that the new deployment operates independently of the previous one
  console.log("[migration-sim] Step 10: Verifying complete independence between original and migrated databases...");
  const originalConn = await mysql.createConnection(sourceConfig);

  // Check that new department does NOT exist in original database
  const [origDept] = await originalConn.query("SELECT id FROM `departments` WHERE `code` = 'MHO-MIGRATED'");
  assert.equal(origDept.length, 0, "New department must NOT exist in original database");

  // Check that new user does NOT exist in original database
  const [origUser] = await originalConn.query("SELECT id FROM `users` WHERE `email` = 'mho.officer@procurenance.com'");
  assert.equal(origUser.length, 0, "New user must NOT exist in original database");

  // Check that new PR does NOT exist in original database
  const [origPr] = await originalConn.query("SELECT id FROM `prheaders` WHERE `prNumber` = 'PR-2026-MIGRATED-001'");
  assert.equal(origPr.length, 0, "New PR must NOT exist in original database");

  await originalConn.end();
  await migratedConn.end();

  console.log("========================================================");
  console.log("✅ REAL DEPLOYMENT MIGRATION SIMULATION SUCCEEDED 100%");
  console.log("========================================================\n");
});
