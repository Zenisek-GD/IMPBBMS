import express from "express";
import {
  listRfqs,
  createRfq,
  publishRfq,
  closeRfq,
  cancelRfq,
  submitBid,
  requestBidSubmissionCode,
  verifyBidSubmissionCode,
  openBids,
  listBidsForRfq,
  submitEvaluation,
  closeEvaluation,
  submitPostQualification,
  recommendAward,
  approveAward,
  disapproveAward,
  declareFailureOfBidding,
  abstractOfBids,
  listAwards,
} from "../controllers/biddingController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();

// ── RFQ / ITB ───────────────────────────────────────────────────────────────
router.get(
  "/rfqs",
  requireAnyPermission("bidding.view", "bidding.viewPublished", "bidding.submitBid"),
  listRfqs
);
router.post("/rfqs", requirePermission("bidding.publish"), createRfq);
router.post("/rfqs/:id/publish", requirePermission("bidding.publish"), publishRfq);
router.post("/rfqs/:id/close", requirePermission("bidding.publish"), closeRfq);
router.post("/rfqs/:id/cancel", requirePermission("bidding.publish"), cancelRfq);

// RA 12009 Sec. 64 — a failure of bidding is declared by the committee, not by
// the office that publishes. Two failures on one project open Negotiated
// Procurement under Sec. 35.1.
router.post(
  "/rfqs/:id/declare-failure",
  requireAnyPermission("bidding.chairEvaluation", "bidding.publish"),
  declareFailureOfBidding
);

// ── Bidding ─────────────────────────────────────────────────────────────────
// Requirement 14: a bid is confirmed by a code emailed to the bidder's accredited
// address before it is accepted. Request → verify → submit, all scoped to this RFQ.
router.post(
  "/rfqs/:id/bids/request-code",
  requirePermission("bidding.submitBid"),
  requestBidSubmissionCode
);
router.post(
  "/rfqs/:id/bids/verify-code",
  requirePermission("bidding.submitBid"),
  verifyBidSubmissionCode
);
router.post("/rfqs/:id/bids", requirePermission("bidding.submitBid"), submitBid);
router.post("/rfqs/:id/open", requirePermission("bidding.publish"), openBids);

router.get(
  "/rfqs/:id/bids",
  requireAnyPermission("bidding.view", "bidding.evaluate", "bidding.technicalInput"),
  listBidsForRfq
);

// ── Evaluation ──────────────────────────────────────────────────────────────
router.post(
  "/bids/:bidId/evaluations",
  requireAnyPermission("bidding.evaluate", "bidding.technicalInput"),
  submitEvaluation
);
// Only the Chairperson may lift the blind, so one evaluator cannot unmask.
router.post("/rfqs/:id/close-evaluation", requirePermission("bidding.chairEvaluation"), closeEvaluation);

// ── Post-qualification & award ──────────────────────────────────────────────
router.post(
  "/bids/:bidId/post-qualification",
  requireAnyPermission("bidding.chairEvaluation", "bidding.evaluate"),
  submitPostQualification
);
router.post("/bids/:bidId/recommend-award", requirePermission("bidding.chairEvaluation"), recommendAward);
router.post("/awards/:id/approve", requirePermission("bidding.award"), approveAward);

// RA 12009 Sec. 66 — the HoPE may disapprove on written grounds furnished to
// the BAC. Same permission as approval: it is the same decision, either way.
router.post("/awards/:id/disapprove", requirePermission("bidding.award"), disapproveAward);

router.get("/awards", requireAnyPermission("bidding.view", "bidding.viewPublished"), listAwards);

// ── Abstract of Bids / Quotations ───────────────────────────────────────────
// IRR Sec. 34.3(f). Observers are entitled to it under Sec. 43.5, so they reach
// it too — it is one of the five documents they may demand free of charge.
router.get(
  "/rfqs/:id/abstract",
  requireAnyPermission("bidding.view", "bidding.evaluate", "observer.participate", "audit.viewAll"),
  abstractOfBids
);

export default router;
