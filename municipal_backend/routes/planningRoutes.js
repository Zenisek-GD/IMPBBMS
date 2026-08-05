import express from "express";
import {
  getPlanningOptions,
  listPlans,
  createPlan,
  updatePlan,
  adoptPlan,
  createGoal,
  updateGoal,
  setPriorities,
  listPrograms,
  createProgram,
  createAipEntry,
  updateAipEntry,
  deleteAipEntry,
  transitionProgram,
  listAipEntries,
} from "../controllers/planningController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.get("/options", requirePermission("planning.view"), getPlanningOptions);

// ── Comprehensive Development Plan ───────────────────────────────────────────
router.get("/plans", requirePermission("planning.view"), listPlans);
router.post("/plans", requirePermission("planning.manageCdp"), createPlan);
router.patch("/plans/:id", requirePermission("planning.manageCdp"), updatePlan);

// Adoption is the Sanggunian's act, recorded by its secretary — the same
// office that records the adoption of the investment program. The Planning
// Office writes the plan; it does not adopt its own plan.
router.post("/plans/:id/adopt", requirePermission("planning.adoptAip"), adoptPlan);

router.post("/plans/:id/goals", requirePermission("planning.manageCdp"), createGoal);
router.patch("/goals/:goalId", requirePermission("planning.manageCdp"), updateGoal);

// ── The Mayor's priorities ───────────────────────────────────────────────────
router.post("/priorities", requirePermission("planning.setPriorities"), setPriorities);

// ── Annual Investment Program ────────────────────────────────────────────────
router.get("/investment-programs", requirePermission("planning.view"), listPrograms);
router.post("/investment-programs", requirePermission("planning.manageAip"), createProgram);

router.post("/investment-programs/:id/entries", requirePermission("planning.manageAip"), createAipEntry);
router.patch("/aip-entries/:entryId", requirePermission("planning.manageAip"), updateAipEntry);
router.delete("/aip-entries/:entryId", requirePermission("planning.manageAip"), deleteAipEntry);

// The outer door only: which permission a given transition actually needs
// depends on the stage the program is in, and the controller checks that
// against the state machine. Keep this list in step with AIP_TRANSITIONS —
// a permission missing here is refused before the controller ever runs.
router.post(
  "/investment-programs/:id/transition",
  requireAnyPermission("planning.manageAip", "planning.setPriorities", "planning.adoptAip"),
  transitionProgram
);

// Read-only feed for the budget proposal and APP entry forms. Anyone who can
// see planning can read it; citing an entry is gated where the citing happens.
router.get("/aip-entries", requirePermission("planning.view"), listAipEntries);

export default router;
