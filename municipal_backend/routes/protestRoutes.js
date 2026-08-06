import express from "express";
import {
  getProtestOptions,
  listProtests,
  fileReconsideration,
  fileProtest,
  resolveProtest,
} from "../controllers/protestController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

router.get(
  "/options",
  requireAnyPermission("protest.file", "protest.resolve", "protest.decide"),
  getProtestOptions
);

router.get(
  "/",
  requireAnyPermission("protest.file", "protest.resolve", "protest.decide", "audit.viewAll"),
  listProtests
);

// Sec. 83.1 — the bidder's request for reconsideration to the BAC.
router.post("/rfqs/:rfqId/reconsideration", requirePermission("protest.file"), fileReconsideration);

// Sec. 83.2 — the protest to the HoPE, available only after a denial.
router.post("/", requirePermission("protest.file"), fileProtest);

// The controller routes the decision to the right body: the BAC resolves a
// request for reconsideration, the HoPE resolves a protest.
router.post(
  "/:id/resolve",
  requireAnyPermission("protest.resolve", "protest.decide"),
  resolveProtest
);

export default router;
