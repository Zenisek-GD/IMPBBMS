import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { createTarGzBuffer } from "../services/tarArchive.js";
import { restoreSystemBackup } from "../services/backupEngine.js";
import { sequelize } from "../models/db.js";

const config = {
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
};

const TEST_FAIL_DB = "impbbms_test_failure_suite";

async function cleanupDb() {
  const root = await mysql.createConnection(config);
  await root.query(`DROP DATABASE IF EXISTS \`${TEST_FAIL_DB}\``);
  await root.end();
}

test("restoreSystemBackup aborts immediately if safety backup fails on non-empty database", async (t) => {
  await cleanupDb();
  t.after(cleanupDb);

  // 1. Create target DB with 1 table
  const root = await mysql.createConnection(config);
  await root.query(`CREATE DATABASE \`${TEST_FAIL_DB}\``);
  await root.query(`CREATE TABLE \`${TEST_FAIL_DB}\`.\`precious_data\` (id int primary key, info varchar(50))`);
  await root.query(`INSERT INTO \`${TEST_FAIL_DB}\`.\`precious_data\` VALUES (1, 'do not delete me')`);
  await root.end();

  // Create a minimal valid backup package
  const manifest = {
    formatVersion: "1.0.0",
    payload: { file: "database.sql", sha256: crypto.createHash("sha256").update("SELECT 1;").digest("hex") },
    statistics: { tableCount: 1, totalRows: 0, tableRows: {} },
  };
  const validTar = createTarGzBuffer([
    { name: "manifest.json", content: JSON.stringify(manifest) },
    { name: "database.sql", content: "SELECT 1;" },
  ]);

  // Attempt restore with an invalid / unwritable safety directory (file path instead of directory)
  const tmpFile = path.join(os.tmpdir(), `file-not-dir-${Date.now()}`);
  await fs.writeFile(tmpFile, "blocking file");
  t.after(() => fs.unlink(tmpFile).catch(() => {}));

  // Point safetyBackupDirectory to a path where creating directory or file fails
  const blockedSafetyDir = path.join(tmpFile, "sub");

  await assert.rejects(
    restoreSystemBackup({
      backupPathOrBuffer: validTar,
      config,
      targetDatabase: TEST_FAIL_DB,
      safetyBackupDirectory: blockedSafetyDir,
    }),
    /Failed to create pre-restore safety snapshot/i
  );

  // Verify that precious_data was NOT dropped!
  const verifyConn = await mysql.createConnection({ ...config, database: TEST_FAIL_DB });
  const [rows] = await verifyConn.query("SELECT * FROM precious_data");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].info, "do not delete me");
  await verifyConn.end();
});

test("restoreSystemBackup accurately flags verification failure when row counts mismatch", async (t) => {
  await cleanupDb();
  t.after(cleanupDb);

  // Backup package claims table 'users_audit' should have 10 rows, but SQL only inserts 1 row
  const manifest = {
    formatVersion: "1.0.0",
    payload: {
      file: "database.sql",
      sha256: crypto.createHash("sha256").update("CREATE TABLE `users_audit` (id int primary key); INSERT INTO `users_audit` VALUES (1);").digest("hex"),
    },
    statistics: {
      tableCount: 1,
      totalRows: 10,
      tableRows: { users_audit: 10 },
      documentCount: 0,
      documentBytes: 0,
    },
  };

  const tarWithMismatch = createTarGzBuffer([
    { name: "manifest.json", content: JSON.stringify(manifest) },
    { name: "database.sql", content: "CREATE TABLE `users_audit` (id int primary key); INSERT INTO `users_audit` VALUES (1);" },
  ]);

  const report = await restoreSystemBackup({
    backupPathOrBuffer: tarWithMismatch,
    config,
    targetDatabase: TEST_FAIL_DB,
  });

  assert.equal(report.success, false, "report.success must be false on mismatch");
  assert.equal(report.mismatchCount, 1, "mismatchCount must be 1");
  const mismatchedTable = report.tableDetails.find((t) => t.table === "users_audit");
  assert.ok(mismatchedTable);
  assert.equal(mismatchedTable.expectedRows, 10);
  assert.equal(mismatchedTable.restoredRows, 1);
  assert.equal(mismatchedTable.status, "mismatch");
});

test("restoreSystemBackup attaches safetyBackupPath to error when SQL execution fails midway", async (t) => {
  await cleanupDb();
  t.after(cleanupDb);

  // Setup target database with existing table
  const root = await mysql.createConnection(config);
  await root.query(`CREATE DATABASE \`${TEST_FAIL_DB}\``);
  await root.query(`CREATE TABLE \`${TEST_FAIL_DB}\`.\`existing_tbl\` (id int primary key)`);
  await root.end();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-fail-test-"));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  // SQL dump containing broken syntax that causes execution failure
  const badSql = "CREATE TABLE `t1` (id int); THIS IS INVALID SQL SYNTAX ERROR;";
  const manifest = {
    formatVersion: "1.0.0",
    payload: { file: "database.sql", sha256: crypto.createHash("sha256").update(badSql).digest("hex") },
    statistics: { tableCount: 1, totalRows: 0, tableRows: { t1: 0 } },
  };

  const badTar = createTarGzBuffer([
    { name: "manifest.json", content: JSON.stringify(manifest) },
    { name: "database.sql", content: badSql },
  ]);

  let thrownErr = null;
  try {
    await restoreSystemBackup({
      backupPathOrBuffer: badTar,
      config,
      targetDatabase: TEST_FAIL_DB,
      safetyBackupDirectory: tmpDir,
      mysqlPath: false, // force pure-JS to trigger statement error
    });
  } catch (err) {
    thrownErr = err;
  }

  assert.ok(thrownErr, "Restore should throw on SQL execution failure");
  assert.ok(thrownErr.safetyBackupPath, "Error must attach safetyBackupPath");
  assert.ok(await fs.stat(thrownErr.safetyBackupPath).then(() => true).catch(() => false), "Safety backup file must exist on disk");
});

test("restoreBackup controller returns HTTP 422 instead of 200 when verification detects row mismatches", async (t) => {
  await cleanupDb();
  t.after(async () => {
    await cleanupDb();
    const { sequelize } = await import("../models/db.js");
    await sequelize.query("DROP TABLE IF EXISTS `users_audit`");
  });

  const manifest = {
    formatVersion: "1.0.0",
    payload: {
      file: "database.sql",
      sha256: crypto.createHash("sha256").update("CREATE TABLE `users_audit` (id int primary key); INSERT INTO `users_audit` VALUES (1);").digest("hex"),
    },
    statistics: {
      tableCount: 1,
      totalRows: 99,
      tableRows: { users_audit: 99 },
    },
  };

  const badTar = createTarGzBuffer([
    { name: "manifest.json", content: JSON.stringify(manifest) },
    { name: "database.sql", content: "CREATE TABLE `users_audit` (id int primary key); INSERT INTO `users_audit` VALUES (1);" },
  ]);

  const express = (await import("express")).default;
  const backupRoutes = (await import("../routes/backupRoutes.js")).default;
  const { errorHandler } = await import("../middleware/asyncHandler.js");
  const { User, Role } = await import("../models/index.js");
  const { credentialStamp } = await import("../services/authPolicy.js");

  const adminUser = await User.findOne({
    where: { email: "systemadministrator@procurenance.com" },
    include: [Role],
  });
  const stamp = credentialStamp(adminUser);

  const app = express();
  app.use(express.json());
  // Mock session
  app.use((req, res, next) => {
    req.session = {
      userId: adminUser.id,
      authAt: Date.now(),
      loginSessionExpiresAt: Date.now() + 3600000,
      credentialHash: stamp,
    };
    next();
  });
  app.use("/api/backup", backupRoutes);
  app.use(errorHandler);

  const server = app.listen(0);
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  // Write bad tar to temp storage
  const tempFile = path.join(os.tmpdir(), `mismatch-test-${Date.now()}.tar.gz`);
  await fs.writeFile(tempFile, badTar);
  t.after(() => fs.unlink(tempFile).catch(() => {}));

  // Create form-data or upload
  const form = new FormData();
  form.append("backup", new Blob([badTar], { type: "application/gzip" }), "mismatch.tar.gz");
  form.append("confirm", "true");
  form.append("targetDatabase", TEST_FAIL_DB);
  form.append("confirmationPhrase", TEST_FAIL_DB);

  const res = await fetch(`http://127.0.0.1:${port}/api/backup/restore`, {
    method: "POST",
    body: form,
  });

  assert.equal(res.status, 422, "API must return 422 Unprocessable Entity on verification mismatch");
  const body = await res.json();
  assert.equal(body.code, "RESTORE_VERIFICATION_MISMATCH");
  assert.equal(body.report.success, false);
});

