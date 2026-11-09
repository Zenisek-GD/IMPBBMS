import express from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import {
  getBackupStatus,
  getBackupList,
  createBackup,
  downloadBackup,
  deleteBackup,
  inspectBackup,
  restoreBackup,
  bootstrapRestore,
  getSchedule,
  updateSchedule,
} from "../controllers/backupController.js";
import { requireAnyPermission } from "../middleware/permissionMiddleware.js";
import { isRestoreInProgress } from "../services/backupEngine.js";

const router = express.Router();

// Multer storage for backup archives in OS temp directory
const backupUpload = multer({
  dest: path.join(os.tmpdir(), "impbbms-uploads"),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB limit
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Check filename extension
    const ext = path.extname(file.originalname).toLowerCase();
    const isTarGz = file.originalname.toLowerCase().endsWith(".tar.gz");
    if (isTarGz || ext === ".gz" || ext === ".tar" || file.mimetype === "application/gzip" || file.mimetype === "application/x-gzip" || file.mimetype === "application/octet-stream") {
      cb(null, true);
    } else {
      cb(new Error("Upload a valid .tar.gz backup archive."));
    }
  },
});

/**
 * Middleware: Check if system is currently restoring from a backup.
 * Blocks concurrent writes / reads during restoration, returning 503.
 */
export function checkMaintenanceMode(req, res, next) {
  // Allow backup status and inspection requests to pass through
  if (req.path.startsWith("/api/backup/status") || req.path.startsWith("/api/backup/inspect")) {
    return next();
  }

  if (isRestoreInProgress()) {
    res.set("Retry-After", "10");
    return res.status(503).json({
      code: "SYSTEM_RESTORING",
      message: "The system is currently restoring from a data backup. Please wait a moment and refresh.",
    });
  }

  next();
}

// 1. Bootstrap restore (unauthenticated for empty instance or secret key)
router.post("/bootstrap-restore", backupUpload.single("backup"), bootstrapRestore);

// 2. Status (accessible to administrators)
router.get("/status", requireAnyPermission("settings.manage", "security.manage"), getBackupStatus);
router.get("/list", requireAnyPermission("settings.manage", "security.manage"), getBackupList);

// 3. Create & Download
router.post("/create", requireAnyPermission("settings.manage", "security.manage"), createBackup);
router.get("/download/:filename", requireAnyPermission("settings.manage", "security.manage"), downloadBackup);
router.delete("/:filename", requireAnyPermission("settings.manage", "security.manage"), deleteBackup);

// 4. Inspection & Safe Restore
router.post("/inspect", requireAnyPermission("settings.manage", "security.manage"), backupUpload.single("backup"), inspectBackup);
router.post("/restore", requireAnyPermission("settings.manage", "security.manage"), backupUpload.single("backup"), restoreBackup);

// 5. Automated Backup Schedule
router.get("/schedule", requireAnyPermission("settings.manage", "security.manage"), getSchedule);
router.patch("/schedule", requireAnyPermission("settings.manage", "security.manage"), updateSchedule);

export default router;
