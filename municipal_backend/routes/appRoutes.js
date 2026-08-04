import express from "express";
import {
  listAppEntries,
  createAppEntry,
  updateAppEntry,
  transitionAppEntry,
  getModeSuggestion,
} from "../controllers/appEntryController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// Observers hold app.viewPublished only; the controller narrows the query for
// them so they never see drafts or pre-approval entries.
router.get("/", requireAnyPermission("app.view", "app.viewPublished"), listAppEntries);

router.get("/mode-suggestion", requireAnyPermission("app.view", "app.create"), getModeSuggestion);

router.post("/", requirePermission("app.create"), createAppEntry);
router.patch("/:id", requirePermission("app.create"), updateAppEntry);

// The specific permission depends on the action and the entry's current state,
// so it is checked inside the controller against the state machine.
router.post(
  "/:id/transition",
  requireAnyPermission("app.submit", "app.consolidate", "app.certify", "app.approve"),
  transitionAppEntry
);

export default router;
