import express from "express";
import {
  getBudgetPreparationOptions,
  listBudgets,
  getBudget,
  createBudget,
  transitionBudget,
  recordProceeding,
  updateProceeding,
} from "../controllers/budgetPreparationController.js";
import {
  listProposals,
  createProposal,
  updateProposal,
  submitProposal,
  reviewProposal,
  finaliseProposal,
  returnProposal,
} from "../controllers/budgetProposalController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.get("/options", requirePermission("budget.view"), getBudgetPreparationOptions);

// ── The executive budget ─────────────────────────────────────────────────────
// Reading is open to anyone who can see the budget at all — a department head
// needs to know where the year's budget has got to. Every act on it is gated
// separately, by the body that performs it.
router.get("/budgets", requirePermission("budget.view"), listBudgets);
router.get("/budgets/:id", requirePermission("budget.view"), getBudget);
router.post("/budgets", requirePermission("budget.prepareExecutive"), createBudget);

// Outer door only. Which permission a transition needs depends on the stage the
// budget is in, and the controller checks it against the state machine — keep
// this list in step with BUDGET_TRANSITIONS or a body will hold its permission
// and still be refused before the controller runs.
router.post(
  "/budgets/:id/transition",
  requireAnyPermission(
    "budget.prepareExecutive",
    "budget.reviewProposal",
    "budget.consolidateProposals",
    "budget.conductForum",
    "budget.conductHearing",
    "budget.finaliseExecutive",
    "budget.approveExecutive",
    "budget.enactOrdinance",
    "budget.recordProvincialReview"
  ),
  transitionBudget
);

// Forum and hearing minutes. The controller picks the right permission from the
// proceeding's own type, since the two meetings are held by the same committee
// but are separately accountable.
router.post(
  "/budgets/:id/proceedings",
  requireAnyPermission("budget.conductForum", "budget.conductHearing"),
  recordProceeding
);
router.patch(
  "/proceedings/:proceedingId",
  requireAnyPermission("budget.conductForum", "budget.conductHearing"),
  updateProceeding
);

// ── Departmental proposals ───────────────────────────────────────────────────
// An office prepares its own proposal. The Budget Office may also prepare one
// on an office's behalf — offices without a system user still have to be in the
// budget, and in practice the Budget Office keys those in. The controller is
// what decides *whose* proposal each caller may touch; this gate only decides
// who may reach the endpoint at all.
router.get("/proposals", requirePermission("budget.view"), listProposals);
router.post(
  "/proposals",
  requireAnyPermission("budget.proposeBudget", "budget.prepareExecutive"),
  createProposal
);
router.patch(
  "/proposals/:id",
  requireAnyPermission("budget.proposeBudget", "budget.prepareExecutive"),
  updateProposal
);
router.post(
  "/proposals/:id/submit",
  requireAnyPermission("budget.proposeBudget", "budget.prepareExecutive"),
  submitProposal
);

router.post("/proposals/:id/review", requirePermission("budget.reviewProposal"), reviewProposal);
router.post("/proposals/:id/finalise", requirePermission("budget.finaliseExecutive"), finaliseProposal);
router.post(
  "/proposals/:id/return",
  requireAnyPermission("budget.reviewProposal", "budget.consolidateProposals"),
  returnProposal
);

export default router;
