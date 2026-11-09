import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { createTarHeader, createTarGzBuffer, extractTarGz } from "../services/tarArchive.js";
import { inspectSystemBackup, restoreSystemBackup, setRestoreState } from "../services/backupEngine.js";
import { isBootstrapAuthorized } from "../controllers/backupController.js";
import backupRoutes, { checkMaintenanceMode } from "../routes/backupRoutes.js";
import { errorHandler } from "../middleware/asyncHandler.js";

test("extractTarGz enforces strict entry allowlisting and rejects unauthorized files and path traversal", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-sec-tar-"));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  // 1. Path traversal with relative path
  const traversalTar = createTarGzBuffer([
    { name: "../../evil.sh", content: "echo hacked" },
    { name: "manifest.json", content: "{}" },
  ]);
  await assert.rejects(
    extractTarGz(traversalTar, tmpDir),
    /Unauthorized or invalid filename in backup package/i
  );

  // 2. Unexpected filename not in allowlist
  const unexpectedTar = createTarGzBuffer([
    { name: "evil.bat", content: "echo hacked" },
    { name: "manifest.json", content: "{}" },
  ]);
  await assert.rejects(
    extractTarGz(unexpectedTar, tmpDir),
    /Unauthorized or invalid filename in backup package/i
  );

  // 3. Valid allowlisted entries succeed
  const validTar = createTarGzBuffer([
    { name: "manifest.json", content: '{"formatVersion":"1.0.0"}' },
    { name: "database.sql", content: "SELECT 1;" },
    { name: "checksums.json", content: "{}" },
  ]);
  const extracted = await extractTarGz(validTar, tmpDir);
  assert.equal(extracted.length, 3);
  assert.ok(extracted.every((e) => ["manifest.json", "database.sql", "checksums.json"].includes(e.name)));
});

test("restoreSystemBackup forbids targeting MySQL internal system databases", async () => {
  const systemDbs = ["mysql", "information_schema", "performance_schema", "sys"];
  for (const db of systemDbs) {
    await assert.rejects(
      restoreSystemBackup({
        backupPathOrBuffer: Buffer.from("dummy"),
        config: {},
        targetDatabase: db,
      }),
      /Restoration into system database .* is strictly prohibited/i
    );
  }
});

test("inspectSystemBackup verifies independent checksums.json integrity when present", async () => {
  const manifest = JSON.stringify({
    formatVersion: "1.0.0",
    payload: { file: "database.sql", sha256: crypto.createHash("sha256").update("SELECT 1;").digest("hex") },
  });
  const manifestHash = crypto.createHash("sha256").update(manifest).digest("hex");
  const sqlHash = crypto.createHash("sha256").update("SELECT 1;").digest("hex");

  // Tampered checksums.json
  const badChecksums = JSON.stringify({
    "manifest.json": manifestHash,
    "database.sql": "badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad",
  });

  const tamperedTar = createTarGzBuffer([
    { name: "manifest.json", content: manifest },
    { name: "database.sql", content: "SELECT 1;" },
    { name: "checksums.json", content: badChecksums },
  ]);

  await assert.rejects(
    inspectSystemBackup(tamperedTar),
    /checksums\.json mismatch for database\.sql/i
  );
});

test("checkMaintenanceMode attaches RFC-compliant Retry-After header", async (t) => {
  setRestoreState(true, { restoredBy: { name: "Audit Tester" } });
  t.after(() => setRestoreState(false));

  const app = express();
  app.use(checkMaintenanceMode);
  app.get("/api/test", (req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const res = await fetch(`http://127.0.0.1:${port}/api/test`);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Retry-After"), "10");
  const body = await res.json();
  assert.equal(body.code, "SYSTEM_RESTORING");
});

test("isBootstrapAuthorized helper behavior across key and user count variations", () => {
  // Case A: configuredKey is set - MUST require valid key regardless of userCount
  assert.equal(isBootstrapAuthorized({ userCount: 0, bootstrapKey: undefined, configuredKey: "mysecret" }), false);
  assert.equal(isBootstrapAuthorized({ userCount: 0, bootstrapKey: "wrong", configuredKey: "mysecret" }), false);
  assert.equal(isBootstrapAuthorized({ userCount: 0, bootstrapKey: "mysecret", configuredKey: "mysecret" }), true);
  assert.equal(isBootstrapAuthorized({ userCount: 5, bootstrapKey: undefined, configuredKey: "mysecret" }), false);
  assert.equal(isBootstrapAuthorized({ userCount: 5, bootstrapKey: "wrong", configuredKey: "mysecret" }), false);
  assert.equal(isBootstrapAuthorized({ userCount: 5, bootstrapKey: "mysecret", configuredKey: "mysecret" }), true);

  // Case B: configuredKey is NOT set
  assert.equal(isBootstrapAuthorized({ userCount: 0, bootstrapKey: undefined, configuredKey: null }), true);
  assert.equal(isBootstrapAuthorized({ userCount: 1, bootstrapKey: undefined, configuredKey: null }), false);
  assert.equal(isBootstrapAuthorized({ userCount: 5, bootstrapKey: "anykey", configuredKey: null }), false);
});

test("bootstrapRestore security: requires X-Bootstrap-Key when configured even if userCount === 0", async (t) => {
  const prevKey = process.env.MIGRATION_BOOTSTRAP_KEY;
  process.env.MIGRATION_BOOTSTRAP_KEY = "super-secret-bootstrap-token";
  t.after(() => {
    process.env.MIGRATION_BOOTSTRAP_KEY = prevKey;
  });

  const app = express();
  app.use(express.json());
  app.use("/api/backup", backupRoutes);
  app.use(errorHandler);

  const server = app.listen(0);
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  // 1. Without key should be rejected with 403
  const resNoKey = await fetch(`http://127.0.0.1:${port}/api/backup/bootstrap-restore`, {
    method: "POST",
  });
  assert.equal(resNoKey.status, 403);
  const bodyNoKey = await resNoKey.json();
  assert.match(bodyNoKey.message, /Bootstrap restoration is restricted/i);

  // 2. With wrong key should be rejected with 403
  const resWrongKey = await fetch(`http://127.0.0.1:${port}/api/backup/bootstrap-restore`, {
    method: "POST",
    headers: { "X-Bootstrap-Key": "wrong-key" },
  });
  assert.equal(resWrongKey.status, 403);

  // 3. With missing file but valid key should proceed past auth (failing on missing file with 400)
  const resValidKeyNoFile = await fetch(`http://127.0.0.1:${port}/api/backup/bootstrap-restore`, {
    method: "POST",
    headers: { "X-Bootstrap-Key": "super-secret-bootstrap-token" },
  });
  assert.equal(resValidKeyNoFile.status, 400);
  const bodyValidKey = await resValidKeyNoFile.json();
  assert.match(bodyValidKey.message, /backup archive file .* is required/i);
});
