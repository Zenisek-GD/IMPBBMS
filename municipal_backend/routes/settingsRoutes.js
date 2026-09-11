import express from "express";
import {
  getSettings,
  updateSettings,
  getShortcuts,
  updateShortcuts,
  getProcurementSettings,
  updateProcurementSettings,
  listProcurementLimits,
  createProcurementLimit,
  updateProcurementLimit,
} from "../controllers/settingsController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Any authenticated role may read the LGU profile — the procurement thresholds
// it implies are needed wherever an ABC is entered. Only the System
// Administrator may change it.
router.get("/", requireAnyPermission("settings.manage", "app.view", "app.create", "pr.view"), getSettings);
router.patch("/", requirePermission("settings.manage"), updateSettings);
router.get("/procurement", requireAnyPermission("settings.manage", "bidding.view", "pr.view"), getProcurementSettings);
router.patch("/procurement", requirePermission("settings.manage"), updateProcurementSettings);
router.get("/thresholds", requireAnyPermission("settings.manage", "bidding.view", "pr.view", "app.view", "app.create"), listProcurementLimits);
router.post("/thresholds", requirePermission("settings.manage"), createProcurementLimit);
router.patch("/thresholds/:id", requirePermission("settings.manage"), updateProcurementLimit);

// Navigation shortcut overrides. Any authenticated user reads them (the sidebar
// needs them on every page); only the admin writes them.
router.get("/shortcuts", requireAnyPermission("settings.manage", "app.view", "app.create", "pr.view"), getShortcuts);
router.patch("/shortcuts", requirePermission("settings.manage"), updateShortcuts);

export default router;
