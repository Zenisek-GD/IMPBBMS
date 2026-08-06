import express from "express";
import {
  listContracts,
  createContract,
  issueForSignature,
  signContract,
  postPerformanceSecurity,
  issueNoticeToProceed,
  reportDelivery,
  inspectDelivery,
  listDeliveries,
  issueVariationOrder,
  terminateContract,
  postWarrantySecurity,
} from "../controllers/contractController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.get(
  "/",
  requireAnyPermission("contract.view", "contract.viewPublished", "delivery.submitInvoice"),
  listContracts
);
router.post("/", requirePermission("contract.draft"), createContract);
router.post("/:id/issue", requirePermission("contract.draft"), issueForSignature);

// RA 12009 Sec. 68 — posted before signing. The supplier posts it; the
// Secretariat records it when the instrument arrives on paper, which is the
// ordinary case, so both reach this.
router.post(
  "/:id/performance-security",
  requireAnyPermission("contract.draft", "delivery.submitInvoice"),
  postPerformanceSecurity
);

// Both the LGU signatory (contract.sign) and the supplier reach this — the
// controller decides which signature is being applied.
router.post("/:id/sign", requireAnyPermission("contract.sign", "delivery.submitInvoice"), signContract);

// The Notice to Proceed starts contract time. It is the LGU's instrument, not
// the Secretariat's paperwork, so it sits with the officer who signs for the
// LGU rather than with whoever drafted the contract.
router.post("/:id/notice-to-proceed", requirePermission("contract.sign"), issueNoticeToProceed);

// ── Delivery ────────────────────────────────────────────────────────────────
router.get("/deliveries/all", requireAnyPermission("delivery.report", "contract.view"), listDeliveries);
router.post("/:id/deliveries", requireAnyPermission("delivery.submitInvoice", "delivery.report"), reportDelivery);
router.post("/deliveries/:deliveryId/inspect", requirePermission("delivery.report"), inspectDelivery);

// ── Contract implementation (RA 12009 Sec. 71) ──────────────────────────────
// Variation orders and termination are the HoPE's — Sec. 71 puts approval of
// both with the Head of the Procuring Entity, and both bind the municipality
// further or release it from a commitment it made.
router.post("/:id/variation-order", requirePermission("contract.sign"), issueVariationOrder);
router.post("/:id/terminate", requirePermission("contract.sign"), terminateContract);

// Warranty security is posted by the supplier on final acceptance and recorded
// by the office that took the work over.
router.post(
  "/:id/warranty-security",
  requireAnyPermission("contract.draft", "delivery.submitInvoice"),
  postWarrantySecurity
);

export default router;
