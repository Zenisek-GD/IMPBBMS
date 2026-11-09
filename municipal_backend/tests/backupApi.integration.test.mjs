import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import session from "express-session";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import "../config/env.js";
import { sequelize } from "../models/db.js";
import backupRoutes, { checkMaintenanceMode } from "../routes/backupRoutes.js";
import { wrapRouterStack, errorHandler } from "../middleware/asyncHandler.js";
import { setRestoreState } from "../services/backupEngine.js";
import { credentialStamp } from "../services/authPolicy.js";
import { User, Role } from "../models/index.js";

test("Backup HTTP API routes and administrative safeguards", async (t) => {
  const tempStorage = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-api-test-"));
  const prevStorage = process.env.BACKUP_STORAGE_DIR;
  process.env.BACKUP_STORAGE_DIR = tempStorage;
  t.after(async () => {
    process.env.BACKUP_STORAGE_DIR = prevStorage;
    await fs.rm(tempStorage, { recursive: true, force: true });
    setRestoreState(false);
  });

  const adminUser = await User.findOne({
    where: { email: "systemadministrator@procurenance.com" },
    include: [Role],
  });
  assert.ok(adminUser, "Admin user must exist in seeded DB");
  const stamp = credentialStamp(adminUser);

  // Create isolated express app for testing
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Simulate authenticated System Administrator session
  app.use((req, res, next) => {
    req.session = {
      userId: adminUser.id,
      authAt: Date.now(),
      loginSessionExpiresAt: Date.now() + 3600000,
      credentialHash: stamp,
    };
    next();
  });

  app.use(checkMaintenanceMode);
  app.use("/api/backup", backupRoutes);
  app.get("/api/test-maintenance", (req, res) => res.json({ ok: true }));
  app.use(errorHandler);

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  // Helper for requests
  const request = async (path, options = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, headers: res.headers, body };
  };

  // 1. GET /api/backup/status
  const statusRes = await request("/api/backup/status");
  assert.equal(statusRes.status, 200);
  assert.ok(statusRes.body.storageDirectory);
  assert.equal(typeof statusRes.body.backupCount, "number");
  assert.equal(statusRes.body.isRestoring, false);

  // 2. POST /api/backup/create
  const createRes = await request("/api/backup/create", {
    method: "POST",
    body: JSON.stringify({ label: "test-api-export" }),
  });
  assert.equal(createRes.status, 200);
  assert.equal(createRes.body.status, "created");
  assert.ok(createRes.body.backup.filename);
  const createdFilename = createRes.body.backup.filename;

  // 3. GET /api/backup/list
  const listRes = await request("/api/backup/list");
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.backups));
  assert.ok(listRes.body.backups.some((b) => b.filename === createdFilename));

  // 4. POST /api/backup/inspect with stored filename
  const inspectRes = await request("/api/backup/inspect", {
    method: "POST",
    body: JSON.stringify({ filename: createdFilename }),
  });
  assert.equal(inspectRes.status, 200);
  assert.equal(inspectRes.body.valid, true);
  assert.equal(inspectRes.body.manifest.source.app, "IMPBBMS");
  assert.ok(inspectRes.body.manifest.statistics.tableCount > 0);

  // 5. POST /api/backup/restore requires confirmation phrase
  const badConfirmRes = await request("/api/backup/restore", {
    method: "POST",
    body: JSON.stringify({ filename: createdFilename, confirm: true, confirmationPhrase: "WRONG" }),
  });
  assert.equal(badConfirmRes.status, 400);
  assert.match(badConfirmRes.body.message, /requires explicit confirmation/);

  // 6. GET /api/backup/schedule and PATCH /api/backup/schedule
  const schedGet = await request("/api/backup/schedule");
  assert.equal(schedGet.status, 200);
  assert.ok(schedGet.body.schedule);

  const schedPatch = await request("/api/backup/schedule", {
    method: "PATCH",
    body: JSON.stringify({ enabled: true, intervalHours: 12, maxRetention: 5 }),
  });
  assert.equal(schedPatch.status, 200);
  assert.equal(schedPatch.body.schedule.enabled, true);
  assert.equal(schedPatch.body.schedule.intervalHours, 12);
  assert.equal(schedPatch.body.schedule.maxRetention, 5);

  // 7. Maintenance Mode 503 test
  setRestoreState(true, { restoredBy: { name: "Test Admin" } });
  const maintenanceRes = await request("/api/test-maintenance");
  assert.equal(maintenanceRes.status, 503);
  assert.equal(maintenanceRes.body.code, "SYSTEM_RESTORING");

  // Status endpoint still responds during maintenance
  const statusDuringMaintenance = await request("/api/backup/status");
  assert.equal(statusDuringMaintenance.status, 200);
  assert.equal(statusDuringMaintenance.body.isRestoring, true);

  setRestoreState(false);

  // 8. DELETE /api/backup/:filename
  const delRes = await request(`/api/backup/${createdFilename}`, { method: "DELETE" });
  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.deleted, true);

  const listAfterDel = await request("/api/backup/list");
  assert.ok(!listAfterDel.body.backups.some((b) => b.filename === createdFilename));
});
