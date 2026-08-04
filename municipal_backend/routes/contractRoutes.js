import express from "express";
import {
  listContracts,
  createContract,
  issueForSignature,
  signContract,
  reportDelivery,
  inspectDelivery,
  listDeliveries,
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

// Both the LGU signatory (contract.sign) and the supplier reach this — the
// controller decides which signature is being applied.
router.post("/:id/sign", requireAnyPermission("contract.sign", "delivery.submitInvoice"), signContract);

// ── Delivery ────────────────────────────────────────────────────────────────
router.get("/deliveries/all", requireAnyPermission("delivery.report", "contract.view"), listDeliveries);
router.post("/:id/deliveries", requireAnyPermission("delivery.submitInvoice", "delivery.report"), reportDelivery);
router.post("/deliveries/:deliveryId/inspect", requirePermission("delivery.report"), inspectDelivery);

export default router;
