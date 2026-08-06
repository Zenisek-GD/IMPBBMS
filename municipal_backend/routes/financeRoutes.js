import express from "express";
import {
  listInvoices,
  submitInvoice,
  certifyInvoice,
  releasePayment,
} from "../controllers/paymentController.js";
import {
  getBudgetMonitor,
  dispatchUnexpendedAlerts,
  listAppropriations,
  createAppropriation,
  updateAppropriation,
  getAppropriationBalance,
  getAppropriationOptions,
  listObligations,
  reenactPriorYear,
} from "../controllers/appropriationController.js";
import {
  listPendingItems,
  flagPendingItem,
  resolvePendingItem,
} from "../controllers/pendingItemController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// ── Invoices & payment ──────────────────────────────────────────────────────
// Certification and release are distinct permissions held by distinct roles:
// the Municipal Accountant certifies the claim, the Municipal Treasurer
// releases the cash. The controller additionally refuses to let one person do
// both on the same voucher, which catches the case where an administrator has
// granted both permissions to a single account.
router.get("/invoices", requireAnyPermission("payment.view", "delivery.submitInvoice"), listInvoices);
router.post("/invoices", requirePermission("delivery.submitInvoice"), submitInvoice);
router.post("/invoices/:id/certify", requirePermission("payment.certify"), certifyInvoice);
router.post("/payments/:paymentId/release", requirePermission("payment.release"), releasePayment);

// ── Appropriation register ──────────────────────────────────────────────────
// The ordinance lines the LGU may spend against. Everything downstream — APP
// entries, obligations, the budget monitor — is measured against these, so this
// is the authoritative record of how much money exists.
router.get("/appropriations", requirePermission("budget.view"), listAppropriations);
router.get("/appropriations/options", requirePermission("budget.view"), getAppropriationOptions);
router.get("/appropriations/:id/balance", requirePermission("budget.view"), getAppropriationBalance);
router.post("/appropriations", requirePermission("budget.manageAppropriations"), createAppropriation);
router.patch("/appropriations/:id", requirePermission("budget.manageAppropriations"), updateAppropriation);

// LGC Sec. 323 — reenact the preceding year's appropriations where the
// Sanggunian has not passed the annual budget. Recorded by the Budget Officer,
// who keeps the appropriation register; the reenactment itself happens by
// operation of law rather than by anyone's decision.
router.post(
  "/appropriations/reenact",
  requirePermission("budget.manageAppropriations"),
  reenactPriorYear
);

// The obligation register — every ORS raised against an appropriation.
router.get("/obligations", requirePermission("budget.view"), listObligations);

// ── Unexpended budget monitoring (Section 7.6) ──────────────────────────────
router.get("/budget-monitor", requirePermission("budget.view"), getBudgetMonitor);
router.post("/budget-monitor/alerts", requirePermission("budget.certify"), dispatchUnexpendedAlerts);

// ── Pending / unbought items (Section 7.5) ──────────────────────────────────
router.get("/pending-items", requireAnyPermission("pr.view", "budget.view"), listPendingItems);
router.post("/pending-items", requireAnyPermission("pr.review", "bidding.publish"), flagPendingItem);
router.post(
  "/pending-items/:id/resolve",
  requireAnyPermission("pr.review", "bidding.publish"),
  resolvePendingItem
);

export default router;
