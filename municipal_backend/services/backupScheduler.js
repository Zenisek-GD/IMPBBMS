import { existsSync, readdirSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SystemSetting } from "../models/systemSettingModel.js";
import { createSystemBackup, inspectSystemBackup, isRestoreInProgress } from "./backupEngine.js";

export function isBackupStorageExternal() {
  return Boolean(process.env.BACKUP_STORAGE_DIR && process.env.BACKUP_STORAGE_DIR.trim().length > 0);
}

export function getBackupStorageDirectory() {
  return process.env.BACKUP_STORAGE_DIR
    ? path.resolve(process.env.BACKUP_STORAGE_DIR)
    : path.resolve(process.cwd(), "..", "impbbms-backups");
}

export async function ensureBackupStorageDirectory() {
  const dir = getBackupStorageDirectory();
  await mkdir(dir, { recursive: true });
  return dir;
}

const SETTING_KEY = "backup_schedule_settings";

export const DEFAULT_SCHEDULE = {
  enabled: false,
  intervalHours: 24, // daily by default
  maxRetention: 7, // keep 7 latest backups
  lastRunAt: null,
  lastStatus: null,
};

/**
 * Retrieves the current automated backup schedule settings.
 */
export async function getScheduleConfig() {
  try {
    const row = await SystemSetting.findOne({ where: { key: SETTING_KEY } });
    if (!row || !row.value) return { ...DEFAULT_SCHEDULE };
    const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    return { ...DEFAULT_SCHEDULE, ...parsed };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
}

/**
 * Updates the automated backup schedule configuration.
 */
export async function updateScheduleConfig(updates) {
  const current = await getScheduleConfig();
  const next = {
    ...current,
    enabled: typeof updates.enabled === "boolean" ? updates.enabled : current.enabled,
    intervalHours: Number.isInteger(Number(updates.intervalHours)) && Number(updates.intervalHours) >= 1
      ? Number(updates.intervalHours)
      : current.intervalHours,
    maxRetention: Number.isInteger(Number(updates.maxRetention)) && Number(updates.maxRetention) >= 1
      ? Number(updates.maxRetention)
      : current.maxRetention,
    ...(updates.lastRunAt !== undefined ? { lastRunAt: updates.lastRunAt } : {}),
    ...(updates.lastStatus !== undefined ? { lastStatus: updates.lastStatus } : {}),
  };

  await SystemSetting.upsert({
    key: SETTING_KEY,
    value: JSON.stringify(next),
  });

  return next;
}

/**
 * Lists all valid backup packages stored in the backup directory.
 */
export async function listStoredBackups() {
  const dir = await ensureBackupStorageDirectory();
  const files = await readdir(dir);
  const backupFiles = files.filter((f) => /^impbbms-backup-.*\.tar\.gz$/.test(f));

  const backups = [];
  for (const filename of backupFiles) {
    const filePath = path.join(dir, filename);
    try {
      const stats = await stat(filePath);
      // Fast check of manifest
      const inspection = await inspectSystemBackup(filePath).catch(() => null);
      backups.push({
        filename,
        path: filePath,
        sizeBytes: stats.size,
        createdAt: inspection?.manifest?.createdAt ?? stats.birthtime?.toISOString() ?? stats.mtime?.toISOString(),
        manifest: inspection?.manifest ?? null,
      });
    } catch (err) {
      console.warn(`[backup] Error reading backup file ${filename}:`, err.message);
    }
  }

  // Sort newest first
  return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Safe resolver for a backup filename ensuring no directory traversal.
 */
export async function resolveStoredBackup(filename) {
  if (!filename || typeof filename !== "string" || !/^[A-Za-z0-9_.-]+\.tar\.gz$/.test(filename)) {
    throw new Error("Invalid backup filename.");
  }
  const dir = await ensureBackupStorageDirectory();
  const filePath = path.join(dir, filename);
  if (!existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filename}`);
  }
  return filePath;
}

/**
 * Deletes a stored backup file.
 */
export async function deleteStoredBackup(filename) {
  const filePath = await resolveStoredBackup(filename);
  await unlink(filePath);
  return { deleted: true, filename };
}

/**
 * Prunes stored backups keeping only the latest maxRetention count.
 */
export async function pruneOldBackups(maxRetention = 7) {
  const all = await listStoredBackups();
  if (all.length <= maxRetention) return { pruned: 0, kept: all.length };

  const toRemove = all.slice(maxRetention);
  for (const b of toRemove) {
    await unlink(b.path).catch(() => {});
  }

  return { pruned: toRemove.length, kept: maxRetention };
}

/**
 * Executes a scheduled backup run if enabled and due.
 */
export async function runScheduledBackupSweep(config) {
  if (isRestoreInProgress()) {
    console.log("[backup-scheduler] Skipping sweep: restore in progress");
    return null;
  }

  const schedule = await getScheduleConfig();
  if (!schedule.enabled) return null;

  const now = Date.now();
  if (schedule.lastRunAt) {
    const lastRunTime = new Date(schedule.lastRunAt).getTime();
    const intervalMs = schedule.intervalHours * 3600 * 1000;
    if (now - lastRunTime < intervalMs) {
      // Not due yet
      return null;
    }
  }

  const storageDir = await ensureBackupStorageDirectory();
  try {
    const backup = await createSystemBackup({
      config,
      backupDirectory: storageDir,
      label: "scheduled-auto-backup",
      createdBy: { id: null, name: "System Scheduler", role: "system" },
    });

    await pruneOldBackups(schedule.maxRetention);

    // Update lastRunAt on successful backup
    const updated = {
      ...schedule,
      lastRunAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
      lastStatus: "success",
    };
    await SystemSetting.upsert({
      key: SETTING_KEY,
      value: JSON.stringify(updated),
    });

    console.log(`[backup-scheduler] Automated backup created: ${backup.filename}`);
    return backup;
  } catch (err) {
    console.error(`[backup-scheduler] Automated backup failed:`, err.message);
    const updated = {
      ...schedule,
      lastAttemptAt: new Date().toISOString(),
      lastFailureAt: new Date().toISOString(),
      lastStatus: `failed: ${err.message}`,
      // Note: lastRunAt is deliberately NOT advanced, so that retry can occur on next sweep!
    };
    await SystemSetting.upsert({
      key: SETTING_KEY,
      value: JSON.stringify(updated),
    }).catch(() => {});
    return null;
  }
}

/**
 * Starts the background timer in Node.js.
 */
export function startBackupScheduler(config) {
  // Check every 15 minutes
  const INTERVAL_MS = 15 * 60 * 1000;
  const timer = setInterval(() => {
    runScheduledBackupSweep(config).catch((err) => {
      console.error("[backup-scheduler] Sweep error:", err.message);
    });
  }, INTERVAL_MS);

  timer.unref?.();
  // Run first check 30 seconds after startup
  setTimeout(() => {
    runScheduledBackupSweep(config).catch(() => {});
  }, 30_000).unref?.();

  return timer;
}
