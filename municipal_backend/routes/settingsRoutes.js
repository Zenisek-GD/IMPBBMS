import express from "express";
import {
  getSettings,
  updateSettings,
  getShortcuts,
  updateShortcuts,
} from "../controllers/settingsController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Any authenticated role may read the LGU profile — the procurement thresholds
// it implies are needed wherever an ABC is entered. Only the System
// Administrator may change it.
router.get("/", requireAnyPermission("settings.manage", "app.view", "app.create", "pr.view"), getSettings);
router.patch("/", requirePermission("settings.manage"), updateSettings);

// Navigation shortcut overrides. Any authenticated user reads them (the sidebar
// needs them on every page); only the admin writes them.
router.get("/shortcuts", requireAnyPermission("settings.manage", "app.view", "app.create", "pr.view"), getShortcuts);
router.patch("/shortcuts", requirePermission("settings.manage"), updateShortcuts);

export default router;
