import express from "express";
import {
  listPrs,
  createPr,
  updatePr,
  transitionPr,
  getAppBalance,
  getModeSuggestion,
} from "../controllers/prController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.get("/", requirePermission("pr.view"), listPrs);

// Real-time remaining APP balance while drafting (Section 5.3).
router.get("/app-balance/:appEntryId", requirePermission("pr.view"), getAppBalance);

router.post("/", requirePermission("pr.create"), createPr);
router.patch("/:id", requirePermission("pr.create"), updatePr);

// This list is only the outer door — it admits anyone who holds *some* role in
// the requisition chain. The controller then checks the permission required by
// the specific transition being attempted, which is the real gate.
//
// Both have to be kept in step: a permission missing here is refused before the
// controller ever runs, which reads as "the Treasurer has the permission but
// still gets a 403".
router.post(
  "/:id/transition",
  requireAnyPermission(
    "pr.create",
    "pr.endorse",
    "pr.certifyCash",
    "pr.approve",
    "pr.certify",
    // The Accountant's obligation (step 18b, LGC Sec. 344). Missing from this
    // outer list the Accountant would hold the permission and still be refused
    // before the controller ran — the trap documented in SYSTEM_MANUAL §12.
    "pr.obligate",
    "pr.determineMode"
  ),
  transitionPr
);

// What the IRR ceilings indicate for this requisition's amount, with the
// available alternatives and the citation behind each. Read by the BAC's mode
// determination form so the committee sees the rule before it decides, rather
// than being told afterwards that its choice needed a justification.
router.get("/:id/mode-suggestion", requirePermission("pr.determineMode"), getModeSuggestion);

export default router;
