import express from "express";
import {
  listPrs,
  createPr,
  updatePr,
  transitionPr,
  getAppBalance,
} from "../controllers/prController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.get("/", requirePermission("pr.view"), listPrs);

// Real-time remaining APP balance while drafting (Section 5.3).
router.get("/app-balance/:appEntryId", requirePermission("pr.view"), getAppBalance);

router.post("/", requirePermission("pr.create"), createPr);
router.patch("/:id", requirePermission("pr.create"), updatePr);

router.post(
  "/:id/transition",
  requireAnyPermission("pr.create", "pr.endorse", "pr.certify", "pr.review", "pr.approve"),
  transitionPr
);

export default router;
