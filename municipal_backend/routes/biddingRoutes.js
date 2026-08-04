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
router.get("/awards", requireAnyPermission("bidding.view", "bidding.viewPublished"), listAwards);

export default router;
