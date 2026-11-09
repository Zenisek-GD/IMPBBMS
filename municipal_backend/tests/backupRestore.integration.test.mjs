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
import {
  ensureBackupStorageDirectory,
  listStoredBackups,
  pruneOldBackups,
  getScheduleConfig,
  updateScheduleConfig,
} from "../services/backupScheduler.js";
import { createTarGzBuffer } from "../services/tarArchive.js";

const config = {
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "municipal_backend",
};

const DISPOSABLE_TEST_DB = "impbbms_test_restore_suite";

async function cleanupDisposableDb() {
  const root = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });
  await root.query(`DROP DATABASE IF EXISTS \`${DISPOSABLE_TEST_DB}\``);
  await root.end();
}

test("full system backup, dry-run inspection, and restoration into a fresh database", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-test-backup-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await cleanupDisposableDb();
  });

  // 1. Insert a test document to ensure BLOB verification runs on a real document
  const conn = await mysql.createConnection(config);
  const pdfBytes = Buffer.from("%PDF-1.4\nTest Document Content For Backup Verification\n%%EOF");
  const docChecksum = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  const [insertDoc] = await conn.query(
    "INSERT INTO `documents` (`filename`, `mimeType`, `sizeBytes`, `content`, `checksum`, `entityRef`, `entityId`, `docType`, `label`, `uploadedAt`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())",
    ["sample-contract.pdf", "application/pdf", pdfBytes.length, pdfBytes, docChecksum, "contract", 999, "contract", "Sample Contract"]
  );
  const docId = insertDoc.insertId;
  await conn.end();

  t.after(async () => {
    const cleanConn = await mysql.createConnection(config);
    await cleanConn.query("DELETE FROM `documents` WHERE id = ?", [docId]);
    await cleanConn.end();
  });

  // 2. Create System Backup
  const backup = await createSystemBackup({
    config,
    backupDirectory: tempDir,
    label: "integration-suite-backup",
    createdBy: { id: 1, name: "Test Admin", role: "systemAdministrator" },
  });

  assert.ok(backup.filename.startsWith("impbbms-backup-"));
  assert.ok(backup.bytes > 0);
  assert.equal(backup.sha256.length, 64);
  assert.ok(backup.manifest.statistics.tableCount >= 60, "Expected at least 60 tables");
  assert.ok(backup.manifest.statistics.totalRows > 0, "Expected non-zero rows");
  assert.ok(backup.manifest.statistics.documentCount >= 1, "Expected at least 1 document");

  // 3. Dry-Run Inspection
  const inspection = await inspectSystemBackup(backup.path, config);
  assert.equal(inspection.valid, true);
  assert.equal(inspection.manifest.source.app, "IMPBBMS");
  assert.equal(inspection.manifest.payload.sha256, backup.manifest.payload.sha256);

  // 4. Setup Fresh Disposable Target Database
  await cleanupDisposableDb();

  // 5. Restore Backup into Fresh Environment
  const report = await restoreSystemBackup({
    backupPathOrBuffer: backup.path,
    config,
    targetDatabase: DISPOSABLE_TEST_DB,
    safetyBackupDirectory: tempDir,
  });

  assert.equal(report.success, true);
  assert.equal(report.targetDatabase, DISPOSABLE_TEST_DB);
  assert.equal(report.mismatchCount, 0, "No table row count mismatches expected");
  assert.ok(report.tablesRestored >= 60);
  assert.ok(report.verifiedDocuments >= 1);

  // 6. Direct Verification on Restored Database
  const restoredConn = await mysql.createConnection({ ...config, database: DISPOSABLE_TEST_DB });

  // A. Verify users & password authentication
  const [users] = await restoredConn.query("SELECT id, email, password FROM `users` WHERE `status` = 'active' LIMIT 3");
  assert.ok(users.length > 0);
  for (const u of users) {
    const valid = await bcrypt.compare("Passw0rd!", u.password);
    assert.equal(valid, true, `User ${u.email} password verification failed`);
  }

  // B. Verify document BLOB content and checksum
  const [[restoredDoc]] = await restoredConn.query("SELECT id, filename, sizeBytes, checksum, content FROM `documents` WHERE id = ?", [docId]);
  assert.ok(restoredDoc, "Document must exist in restored database");
  assert.equal(restoredDoc.filename, "sample-contract.pdf");
  assert.equal(restoredDoc.sizeBytes, pdfBytes.length);
  assert.equal(restoredDoc.checksum, docChecksum);
  assert.equal(Buffer.compare(restoredDoc.content, pdfBytes), 0, "Document bytes must match exactly");

  // C. Verify ephemeral tables were cleaned up
  const [[sessions]] = await restoredConn.query("SELECT COUNT(*) as cnt FROM `loginsessions`");
  assert.equal(Number(sessions.cnt), 0, "loginsessions must be empty after restore");

  await restoredConn.end();
});

test("backup inspection rejects corrupted archive and checksum mismatches", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-test-corrupt-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  // 1. Missing manifest
  const badTarNoManifest = createTarGzBuffer([
    { name: "database.sql", content: "SELECT 1;" },
  ]);
  await assert.rejects(inspectSystemBackup(badTarNoManifest), /missing manifest\.json/);

  // 2. Checksum mismatch in manifest
  const tamperedManifest = JSON.stringify({
    formatVersion: "1.0.0",
    payload: { file: "database.sql", sha256: "0000000000000000000000000000000000000000000000000000000000000000" },
  });
  const badTarWrongHash = createTarGzBuffer([
    { name: "manifest.json", content: tamperedManifest },
    { name: "database.sql", content: "SELECT 1;" },
  ]);
  await assert.rejects(inspectSystemBackup(badTarWrongHash), /checksum mismatch/);

  // 3. Incompatible version
  const badVersionManifest = JSON.stringify({
    formatVersion: "99.0.0",
    payload: { file: "database.sql", sha256: crypto.createHash("sha256").update("SELECT 1;").digest("hex") },
  });
  const badTarWrongVersion = createTarGzBuffer([
    { name: "manifest.json", content: badVersionManifest },
    { name: "database.sql", content: "SELECT 1;" },
  ]);
  await assert.rejects(inspectSystemBackup(badTarWrongVersion), /Unsupported backup format version/);
});

test("pruneOldBackups enforces retention limit", async (t) => {
  const tempStorage = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-retention-test-"));
  t.after(() => fs.rm(tempStorage, { recursive: true, force: true }));

  // Create 5 dummy backup packages
  for (let i = 1; i <= 5; i++) {
    const manifest = {
      formatVersion: "1.0.0",
      createdAt: new Date(Date.now() - (6 - i) * 1000).toISOString(),
      payload: { sha256: crypto.createHash("sha256").update("SELECT 1;").digest("hex") },
      statistics: { tableCount: 1, totalRows: 1, tableRows: {} },
    };
    const gz = createTarGzBuffer([
      { name: "manifest.json", content: JSON.stringify(manifest) },
      { name: "database.sql", content: "SELECT 1;" },
    ]);
    const fname = `impbbms-backup-2026-01-0${i}-000000-id0${i}.tar.gz`;
    await fs.writeFile(path.join(tempStorage, fname), gz);
  }

  // Backup storage override
  const prevEnv = process.env.BACKUP_STORAGE_DIR;
  process.env.BACKUP_STORAGE_DIR = tempStorage;
  t.after(() => { process.env.BACKUP_STORAGE_DIR = prevEnv; });

  const allBefore = await listStoredBackups();
  assert.equal(allBefore.length, 5);

  const pruneResult = await pruneOldBackups(3);
  assert.equal(pruneResult.pruned, 2);
  assert.equal(pruneResult.kept, 3);

  const allAfter = await listStoredBackups();
  assert.equal(allAfter.length, 3);
});

test("schedule configuration updates and persists in systemsettings", async () => {
  const initial = await getScheduleConfig();
  assert.ok(typeof initial.enabled === "boolean");

  const updated = await updateScheduleConfig({
    enabled: true,
    intervalHours: 12,
    maxRetention: 10,
  });

  assert.equal(updated.enabled, true);
  assert.equal(updated.intervalHours, 12);
  assert.equal(updated.maxRetention, 10);

  const reloaded = await getScheduleConfig();
  assert.equal(reloaded.enabled, true);
  assert.equal(reloaded.intervalHours, 12);
  assert.equal(reloaded.maxRetention, 10);
});
