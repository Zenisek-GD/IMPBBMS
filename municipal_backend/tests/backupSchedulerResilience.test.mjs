import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setRestoreState } from "../services/backupEngine.js";
import {
  runScheduledBackupSweep,
  getScheduleConfig,
  updateScheduleConfig,
  isBackupStorageExternal,
  getBackupStorageDirectory,
} from "../services/backupScheduler.js";
import { sequelize } from "../models/db.js";

test("runScheduledBackupSweep skips execution while restore is in progress", async (t) => {
  // Enable schedule
  await updateScheduleConfig({ enabled: true, intervalHours: 1 });
  setRestoreState(true, { restoredBy: { name: "Tester" } });
  t.after(async () => {
    setRestoreState(false);
    await updateScheduleConfig({ enabled: false });
  });

  const result = await runScheduledBackupSweep(sequelize.config);
  assert.equal(result, null, "Sweep must skip execution during restoration");
});

test("runScheduledBackupSweep on failure records lastFailureAt without advancing lastRunAt", async (t) => {
  await updateScheduleConfig({ enabled: true, intervalHours: 24, lastRunAt: "2026-01-01T00:00:00.000Z" });
  t.after(() => updateScheduleConfig({ enabled: false }));

  // Call sweep with broken db config to force failure
  const badConfig = { ...sequelize.config, password: "definitely-wrong-password-to-fail" };
  const res = await runScheduledBackupSweep(badConfig);
  assert.equal(res, null);

  const sched = await getScheduleConfig();
  assert.ok(sched.lastStatus.startsWith("failed:"));
  assert.ok(sched.lastFailureAt);
  // lastRunAt must NOT have been updated to today! It should remain 2026-01-01 so it can retry
  assert.equal(sched.lastRunAt, "2026-01-01T00:00:00.000Z");
});

test("isBackupStorageExternal reflects presence of BACKUP_STORAGE_DIR environment variable", () => {
  const prev = process.env.BACKUP_STORAGE_DIR;
  try {
    delete process.env.BACKUP_STORAGE_DIR;
    assert.equal(isBackupStorageExternal(), false);

    process.env.BACKUP_STORAGE_DIR = "C:\\persistent-backups";
    assert.equal(isBackupStorageExternal(), true);
  } finally {
    if (prev) process.env.BACKUP_STORAGE_DIR = prev;
    else delete process.env.BACKUP_STORAGE_DIR;
  }
});
