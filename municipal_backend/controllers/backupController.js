import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { sequelize } from "../models/db.js";
import { User } from "../models/userModel.js";
import {
  createSystemBackup,
  inspectSystemBackup,
  restoreSystemBackup,
  isRestoreInProgress,
  getRestoreState,
} from "../services/backupEngine.js";
import {
  ensureBackupStorageDirectory,
  getBackupStorageDirectory,
  listStoredBackups,
  resolveStoredBackup,
  deleteStoredBackup,
  pruneOldBackups,
  getScheduleConfig,
  updateScheduleConfig,
  isBackupStorageExternal,
} from "../services/backupScheduler.js";
import { rebaseline } from "../services/integrityMonitor.js";
import { recordAudit } from "../services/auditLog.js";

/**
 * GET /api/backup/status
 */
export async function getBackupStatus(req, res) {
  const schedule = await getScheduleConfig();
  const backups = await listStoredBackups();
  const userCount = await User.count().catch(() => 0);
  const isStorageExternal = isBackupStorageExternal();

  res.json({
    storageDirectory: getBackupStorageDirectory(),
    isStorageExternal,
    storageAdvisory: isStorageExternal
      ? "Backups are stored on configured external/persistent storage."
      : "Backups are currently stored inside the local deployment tree. Configure BACKUP_STORAGE_DIR in .env to an external volume for persistence across container deployments.",
    backupCount: backups.length,
    latestBackup: backups[0] ?? null,
    isRestoring: isRestoreInProgress(),
    restoreState: getRestoreState(),
    schedule,
    currentDatabase: sequelize.config.database,
    isFreshDeployment: userCount === 0,
  });
}

/**
 * GET /api/backup/list
 */
export async function getBackupList(req, res) {
  const backups = await listStoredBackups();
  res.json({ backups });
}

/**
 * POST /api/backup/create
 */
export async function createBackup(req, res) {
  if (isRestoreInProgress()) {
    return res.status(409).json({ message: "Cannot create a backup while restoration is in progress." });
  }

  const storageDir = await ensureBackupStorageDirectory();
  const label = typeof req.body?.label === "string" && req.body.label.trim()
    ? req.body.label.trim().slice(0, 50)
    : "manual-export";

  const backup = await createSystemBackup({
    config: sequelize.config,
    backupDirectory: storageDir,
    label,
    createdBy: req.currentUser ?? null,
  });

  const schedule = await getScheduleConfig();
  await pruneOldBackups(schedule.maxRetention);

  await recordAudit({
    actionType: "system.backup.created",
    entityRef: "systemBackup",
    actorId: req.currentUser?.id ?? null,
    actorName: req.currentUser?.name ?? "System Administrator",
    actorRole: req.currentUser?.Role?.name ?? "systemAdministrator",
    summary: `System backup package created: ${backup.filename} (${Math.round(backup.bytes / 1024)} KB)`,
    afterState: { filename: backup.filename, bytes: backup.bytes, sha256: backup.sha256 },
  }).catch(() => {});

  if (req.query?.download === "true" || req.body?.download === true) {
    return res.download(backup.path, backup.filename);
  }

  res.json({
    status: "created",
    backup: {
      filename: backup.filename,
      bytes: backup.bytes,
      sha256: backup.sha256,
      manifest: backup.manifest,
    },
  });
}

/**
 * GET /api/backup/download/:filename
 */
export async function downloadBackup(req, res) {
  const filename = req.params.filename;
  const filePath = await resolveStoredBackup(filename);
  res.download(filePath, filename);
}

/**
 * DELETE /api/backup/:filename
 */
export async function deleteBackup(req, res) {
  const filename = req.params.filename;
  const result = await deleteStoredBackup(filename);

  await recordAudit({
    actionType: "system.backup.deleted",
    entityRef: "systemBackup",
    actorId: req.currentUser?.id ?? null,
    actorName: req.currentUser?.name ?? "System Administrator",
    actorRole: req.currentUser?.Role?.name ?? "systemAdministrator",
    summary: `System backup package deleted: ${filename}`,
    afterState: { filename },
  }).catch(() => {});

  res.json(result);
}

/**
 * POST /api/backup/inspect
 * Validates package integrity and previews contents without changing any database data.
 */
export async function inspectBackup(req, res) {
  let fileBuffer;
  let sourceLabel = "";

  if (req.file) {
    fileBuffer = req.file.buffer ? req.file.buffer : await fs.readFile(req.file.path);
    sourceLabel = req.file.originalname;
    if (req.file.path) await fs.unlink(req.file.path).catch(() => {});
  } else if (req.body?.filename) {
    const filePath = await resolveStoredBackup(req.body.filename);
    fileBuffer = await fs.readFile(filePath);
    sourceLabel = req.body.filename;
  } else {
    return res.status(400).json({ message: "Provide either an uploaded backup file or a stored filename." });
  }

  const inspection = await inspectSystemBackup(fileBuffer, sequelize.config);

  res.json({
    source: sourceLabel,
    valid: true,
    manifest: inspection.manifest,
    sqlBytes: inspection.sqlBytes,
    currentDatabase: sequelize.config.database,
    currentStats: inspection.currentStats,
  });
}

/**
 * POST /api/backup/restore
 * Performs safe data restoration with explicit confirmation and pre-restore rollback snapshot.
 */
export async function restoreBackup(req, res) {
  if (isRestoreInProgress()) {
    return res.status(409).json({ message: "A restoration operation is already in progress." });
  }

  const targetDb = req.body?.targetDatabase || sequelize.config.database;
  const confirmationPhrase = String(req.body?.confirmationPhrase ?? "").trim();
  const confirmed = req.body?.confirm === true || req.body?.confirm === "true";

  // Explicit confirmation required
  if (!confirmed || (confirmationPhrase !== targetDb && confirmationPhrase !== "RESTORE")) {
    return res.status(400).json({
      message: `Restoration requires explicit confirmation. Set confirm: true and confirmationPhrase to "${targetDb}" or "RESTORE".`,
    });
  }

  let fileBufferOrPath;
  let uploadedTempPath = null;

  if (req.file) {
    if (req.file.path) {
      uploadedTempPath = req.file.path;
      fileBufferOrPath = req.file.path;
    } else {
      fileBufferOrPath = req.file.buffer;
    }
  } else if (req.body?.filename) {
    fileBufferOrPath = await resolveStoredBackup(req.body.filename);
  } else {
    return res.status(400).json({ message: "Provide an uploaded backup file or stored filename to restore." });
  }

  const storageDir = await ensureBackupStorageDirectory();

  try {
    const report = await restoreSystemBackup({
      backupPathOrBuffer: fileBufferOrPath,
      config: sequelize.config,
      targetDatabase: targetDb,
      safetyBackupDirectory: storageDir,
      restoredBy: req.currentUser ?? null,
      rebaselineHook: async () => {
        try {
          await rebaseline();
        } catch (err) {
          console.warn("[restore] integrity rebaseline warning:", err.message);
        }
      },
    });

    if (!report.success || report.mismatchCount > 0) {
      await recordAudit({
        actionType: "system.data.restore_mismatch",
        entityRef: "systemBackup",
        actorId: req.currentUser?.id ?? null,
        actorName: req.currentUser?.name ?? "System Administrator",
        actorRole: req.currentUser?.Role?.name ?? "systemAdministrator",
        summary: `Restoration completed with ${report.mismatchCount} table row count mismatch(es)`,
        afterState: {
          targetDatabase: targetDb,
          mismatchCount: report.mismatchCount,
          safetyBackup: report.safetyBackupPath ? path.basename(report.safetyBackupPath) : null,
        },
      }).catch(() => {});

      return res.status(422).json({
        code: "RESTORE_VERIFICATION_MISMATCH",
        message: `Restoration completed with ${report.mismatchCount} table row count mismatch(es). Please review table details.`,
        report,
      });
    }

    await recordAudit({
      actionType: "system.data.restored",
      entityRef: "systemBackup",
      actorId: req.currentUser?.id ?? null,
      actorName: req.currentUser?.name ?? "System Administrator",
      actorRole: req.currentUser?.Role?.name ?? "systemAdministrator",
      summary: `Restored system data from backup (${report.tablesRestored} tables, ${report.totalRowsRestored} rows, ${report.verifiedDocuments} documents verified)`,
      afterState: {
        targetDatabase: targetDb,
        tablesRestored: report.tablesRestored,
        totalRowsRestored: report.totalRowsRestored,
        verifiedDocuments: report.verifiedDocuments,
        safetyBackup: report.safetyBackupPath ? path.basename(report.safetyBackupPath) : null,
      },
    }).catch(() => {});

    res.json({
      message: "Data restoration completed successfully.",
      report,
    });
  } catch (err) {
    await recordAudit({
      actionType: "system.data.restore_failed",
      entityRef: "systemBackup",
      actorId: req.currentUser?.id ?? null,
      actorName: req.currentUser?.name ?? "System Administrator",
      actorRole: req.currentUser?.Role?.name ?? "systemAdministrator",
      summary: `Data restoration failed: ${err.message}`,
      afterState: { targetDatabase: targetDb, error: err.message, safetyBackup: err.safetyBackupPath ? path.basename(err.safetyBackupPath) : null },
    }).catch(() => {});

    return res.status(500).json({
      code: "RESTORE_FAILED",
      message: `Restoration failed: ${err.message}`,
      safetyBackupPath: err.safetyBackupPath ?? null,
    });
  } finally {
    if (uploadedTempPath) {
      await fs.unlink(uploadedTempPath).catch(() => {});
    }
  }
}

/**
 * Helper to determine if a bootstrap restoration request is authorized.
 */
export function isBootstrapAuthorized({ userCount, bootstrapKey, configuredKey }) {
  if (configuredKey && typeof configuredKey === "string" && configuredKey.trim().length > 0) {
    if (!bootstrapKey || typeof bootstrapKey !== "string") return false;
    const bufA = Buffer.from(bootstrapKey);
    const bufB = Buffer.from(configuredKey);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  return userCount === 0;
}

/**
 * POST /api/backup/bootstrap-restore
 * Secure deployment migration endpoint for a freshly deployed instance that has no administrator yet.
 */
export async function bootstrapRestore(req, res) {
  if (isRestoreInProgress()) {
    return res.status(409).json({ message: "Restoration is already in progress." });
  }

  const userCount = await User.count().catch(() => 0);
  const bootstrapKey = req.get("X-Bootstrap-Key");
  const configuredKey = process.env.MIGRATION_BOOTSTRAP_KEY;

  const isAuthorized = isBootstrapAuthorized({ userCount, bootstrapKey, configuredKey });

  if (!isAuthorized) {
    return res.status(403).json({
      message: "Bootstrap restoration is restricted. Sign in as an administrator or supply valid X-Bootstrap-Key.",
    });
  }

  if (!req.file) {
    return res.status(400).json({ message: "A backup archive file (.tar.gz) is required for bootstrap restore." });
  }

  const fileData = req.file.buffer ? req.file.buffer : await fs.readFile(req.file.path);
  if (req.file.path) await fs.unlink(req.file.path).catch(() => {});

  const storageDir = await ensureBackupStorageDirectory();
  const report = await restoreSystemBackup({
    backupPathOrBuffer: fileData,
    config: sequelize.config,
    targetDatabase: sequelize.config.database,
    safetyBackupDirectory: storageDir,
    restoredBy: { id: null, name: "Bootstrap Migration" },
    rebaselineHook: async () => {
      try {
        await rebaseline();
      } catch {}
    },
  });

  if (!report.success || report.mismatchCount > 0) {
    return res.status(422).json({
      code: "RESTORE_VERIFICATION_MISMATCH",
      message: `Bootstrap restore encountered ${report.mismatchCount} table row count mismatch(es).`,
      report,
    });
  }

  res.json({
    message: "Bootstrap restore completed successfully. Previous data, users, and files are recovered.",
    report,
  });
}

/**
 * GET /api/backup/schedule
 */
export async function getSchedule(req, res) {
  const schedule = await getScheduleConfig();
  res.json({ schedule });
}

/**
 * PATCH /api/backup/schedule
 */
export async function updateSchedule(req, res) {
  const updated = await updateScheduleConfig(req.body ?? {});

  await recordAudit({
    actionType: "system.backup.schedule_updated",
    entityRef: "systemBackup",
    actorId: req.currentUser?.id ?? null,
    actorName: req.currentUser?.name ?? "System Administrator",
    actorRole: req.currentUser?.Role?.name ?? "systemAdministrator",
    summary: `Automated backup schedule updated: enabled=${updated.enabled}, interval=${updated.intervalHours}h, retention=${updated.maxRetention}`,
    afterState: updated,
  }).catch(() => {});

  res.json({ schedule: updated });
}
