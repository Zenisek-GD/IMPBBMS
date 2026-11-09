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
import {
  createSystemBackup,
  inspectSystemBackup,
  restoreSystemBackup,
} from "../services/backupEngine.js";

const config = {
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "municipal_backend",
};

const DISPOSABLE_JS_DB = "impbbms_test_purejs_suite";

async function cleanupDisposableDb() {
  const root = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });
  await root.query(`DROP DATABASE IF EXISTS \`${DISPOSABLE_JS_DB}\``);
  await root.end();
}

test("Pure JavaScript fallback engine: independent export, inspection, and restoration into fresh environment", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-purejs-suite-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await cleanupDisposableDb();
  });

  // 1. Insert multiple binary test documents (PDF + PNG binary header) with checksums into source DB
  const conn = await mysql.createConnection(config);
  const pdfBytes = Buffer.from("%PDF-1.4\nPure JS Fallback Engine Document Verification\n%%EOF");
  const pdfChecksum = crypto.createHash("sha256").update(pdfBytes).digest("hex");

  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const pngChecksum = crypto.createHash("sha256").update(pngBytes).digest("hex");

  const [doc1] = await conn.query(
    "INSERT INTO `documents` (`filename`, `mimeType`, `sizeBytes`, `content`, `checksum`, `entityRef`, `entityId`, `docType`, `label`, `uploadedAt`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
    ["js-fallback-spec.pdf", "application/pdf", pdfBytes.length, pdfBytes, pdfChecksum, "contract", 101, "contract", "Fallback Spec"]
  );
  const [doc2] = await conn.query(
    "INSERT INTO `documents` (`filename`, `mimeType`, `sizeBytes`, `content`, `checksum`, `entityRef`, `entityId`, `docType`, `label`, `uploadedAt`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
    ["js-fallback-logo.png", "image/png", pngBytes.length, pngBytes, pngChecksum, "vendor", 202, "attachment", "Vendor Logo"]
  );

  const doc1Id = doc1.insertId;
  const doc2Id = doc2.insertId;
  await conn.end();

  t.after(async () => {
    const cleanConn = await mysql.createConnection(config);
    await cleanConn.query("DELETE FROM `documents` WHERE id IN (?, ?)", [doc1Id, doc2Id]);
    await cleanConn.end();
  });

  // 2. Create System Backup strictly using Pure JS Dumper (mysqldumpPath: false)
  const backup = await createSystemBackup({
    config,
    backupDirectory: tempDir,
    label: "pure-js-engine-verification",
    createdBy: { id: null, name: "PureJS Tester", role: "systemAdministrator" },
    mysqldumpPath: false, // Disables native mysqldump execution
  });

  assert.ok(backup.filename.startsWith("impbbms-backup-"));
  assert.ok(backup.bytes > 0);
  assert.equal(backup.sha256.length, 64);
  assert.equal(backup.manifest.statistics.tableCount, 69, "Pure JS dump must cover all 69 tables");
  assert.ok(backup.manifest.statistics.documentCount >= 2, "Expected at least 2 documents in dump");

  // 3. Inspect Backup Package
  const inspection = await inspectSystemBackup(backup.path, config);
  assert.equal(inspection.valid, true);
  assert.equal(inspection.manifest.statistics.tableCount, 69);
  assert.equal(inspection.manifest.payload.sha256, backup.manifest.payload.sha256);

  // 4. Clean and prepare fresh target database
  await cleanupDisposableDb();

  // 5. Restore Backup strictly using Pure JS SQL runner (mysqlPath: false)
  const report = await restoreSystemBackup({
    backupPathOrBuffer: backup.path,
    config,
    targetDatabase: DISPOSABLE_JS_DB,
    safetyBackupDirectory: tempDir,
    mysqlPath: false, // Disables native mysql CLI execution
  });

  assert.equal(report.success, true, "Pure JS restoration must succeed");
  assert.equal(report.mismatchCount, 0, "No row count mismatches allowed");
  assert.equal(report.tablesRestored, 69, "All 69 tables must be restored");
  assert.ok(report.verifiedDocuments >= 2, "Both test documents must be verified");

  // 6. Direct In-Database Functional and Constraint Verification
  const restoredConn = await mysql.createConnection({ ...config, database: DISPOSABLE_JS_DB });

  // A. Verify User Accounts & bcrypt Password Hashes
  const [users] = await restoredConn.query(
    "SELECT email, password FROM `users` WHERE `email` IN ('systemadministrator@procurenance.com', 'hope@procurenance.com', 'vendor@procurenance.com')"
  );
  assert.equal(users.length, 3);
  for (const u of users) {
    const valid = await bcrypt.compare("Passw0rd!", u.password);
    assert.equal(valid, true, `User ${u.email} password verification failed`);
  }

  // B. Verify Document LONGBLOB Byte-Exact Matching
  const [docs] = await restoredConn.query("SELECT id, filename, content, checksum, sizeBytes FROM `documents` WHERE id IN (?, ?)", [doc1Id, doc2Id]);
  assert.equal(docs.length, 2);

  const restoredPdf = docs.find((d) => d.id === doc1Id);
  assert.ok(restoredPdf);
  assert.equal(restoredPdf.filename, "js-fallback-spec.pdf");
  assert.equal(restoredPdf.checksum, pdfChecksum);
  assert.equal(Buffer.compare(restoredPdf.content, pdfBytes), 0, "PDF bytes must match bit-for-bit");

  const restoredPng = docs.find((d) => d.id === doc2Id);
  assert.ok(restoredPng);
  assert.equal(restoredPng.filename, "js-fallback-logo.png");
  assert.equal(restoredPng.checksum, pngChecksum);
  assert.equal(Buffer.compare(restoredPng.content, pngBytes), 0, "PNG bytes must match bit-for-bit");

  // C. Verify Auto-Increment Sequences
  const [[maxDept]] = await restoredConn.query("SELECT MAX(id) as maxId FROM `departments`");
  const previousMaxDeptId = Number(maxDept.maxId);
  const [insertDept] = await restoredConn.query(
    "INSERT INTO `departments` (`name`, `code`, `status`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, NOW(), NOW())",
    ["Post-Restore Test Dept", `PRD-${Date.now().toString().slice(-4)}`, "active"]
  );
  assert.equal(insertDept.insertId, previousMaxDeptId + 1, "Auto-increment must sequential advance");

  // D. Verify Foreign Key Constraint Enforcement (checks that FOREIGN_KEY_CHECKS=1 is active)
  // Attempt to insert user with non-existent roleId - MUST FAIL with ER_NO_REFERENCED_ROW_2
  await assert.rejects(
    restoredConn.query(
      "INSERT INTO `users` (`name`, `email`, `password`, `roleId`, `departmentId`, `status`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())",
      ["Invalid User", "invalid@procurenance.com", "hash", 999999, 1, "active"]
    ),
    /foreign key constraint fails/i,
    "MySQL Foreign key checks must be enforced after restore"
  );

  // E. Verify Ephemeral Session Tables Sanitization
  const [[sessCount]] = await restoredConn.query("SELECT COUNT(*) as cnt FROM `loginsessions`");
  assert.equal(Number(sessCount.cnt), 0, "loginsessions must be clean");

  await restoredConn.end();
});
