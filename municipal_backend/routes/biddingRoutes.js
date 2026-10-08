import express from "express";
import { getEvaluationPlan, saveEvaluationPlan, approveEvaluationPlan, declareEvaluatorConflict, returnEvaluationForCorrection, getEvaluationAdministration, requestCriteriaAmendment, approveCriteriaAmendment } from "../controllers/evaluationWorkflowController.js";
import { updateRfqSchedule, updateSvpTerms } from "../controllers/biddingController.js";
import { updateRfqInformation, recordAwardReceipt } from "../controllers/biddingController.js";
import { listTwg, declareTwgConflict, saveTwg } from "../controllers/twgController.js";
import {
  listRfqs,
  createRfq,
  publishRfq,
  closeRfq,
  cancelRfq,
  submitBid,
  listMyQuotations,
  submitSvpEligibilityEvidence,
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
import { upload, describeUploadError } from "../services/documentStore.js";
import { rateLimit } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();
router.get("/rfqs/:id/evaluation-plan", requireAnyPermission("bidding.view", "bidding.publish", "bidding.evaluate", "bidding.technicalInput", "bidding.chairEvaluation"), getEvaluationPlan);
router.put("/rfqs/:id/evaluation-plan", requirePermission("bidding.publish"), saveEvaluationPlan);
router.post("/rfqs/:id/evaluation-plan/approve", requirePermission("bidding.chairEvaluation"), approveEvaluationPlan);
router.post("/rfqs/:id/evaluation-plan/amendments", requirePermission("bidding.publish"), requestCriteriaAmendment);
router.post("/evaluation-plan/amendments/:amendmentId/approve", requirePermission("bidding.chairEvaluation"), approveCriteriaAmendment);
router.post("/rfqs/:id/evaluator-declaration", requireAnyPermission("bidding.evaluate", "bidding.technicalInput"), declareEvaluatorConflict);
router.get("/rfqs/:id/evaluation-administration", requireAnyPermission("bidding.view", "bidding.evaluate", "bidding.technicalInput", "bidding.chairEvaluation", "audit.viewAll"), getEvaluationAdministration);
router.post("/evaluations/:kind/:evaluationId/return", requirePermission("bidding.chairEvaluation"), returnEvaluationForCorrection);

// ── RFQ / ITB ───────────────────────────────────────────────────────────────
router.get(
  "/rfqs",
  requireAnyPermission("bidding.view", "bidding.viewPublished", "bidding.submitBid"),
  listRfqs
);
router.post("/rfqs", requirePermission("bidding.publish"), createRfq);
router.patch("/rfqs/:id/schedule", requirePermission("bidding.publish"), updateRfqSchedule);
router.patch("/rfqs/:id/svp-terms", requirePermission("bidding.publish"), updateSvpTerms);
router.patch("/rfqs/:id/information", requirePermission("bidding.publish"), updateRfqInformation);
router.get("/rfqs/:id/twg", requireAnyPermission("bidding.view", "bidding.evaluate", "bidding.technicalInput", "bidding.chairEvaluation", "audit.viewAll"), listTwg);
router.post("/rfqs/:id/twg/declaration", requirePermission("bidding.technicalInput"), declareTwgConflict);
router.post("/bids/:bidId/twg", requirePermission("bidding.technicalInput"), saveTwg);
router.post("/rfqs/:id/publish", requirePermission("bidding.publish"), publishRfq);
router.post("/rfqs/:id/close", requirePermission("bidding.publish"), closeRfq);
// The controller requires an explicit HoPE decision once quotations exist or
// the deadline/opening stage has passed; the publishing office can only cancel
// an unanswered draft or live solicitation.
router.post("/rfqs/:id/cancel", requireAnyPermission("bidding.publish", "bidding.award"), cancelRfq);

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
const receiveQuotationEvidence = (req, res, next) => upload.fields([
  { name: "technicalOffer", maxCount: 1 },
  { name: "eligibilityEvidence", maxCount: 1 },
  { name: "signedBidDocument", maxCount: 1 },
])(req, res, (error) => error ? res.status(400).json({ message: describeUploadError(error) }) : next());
router.post("/rfqs/:id/bids", requirePermission("bidding.submitBid"), rateLimit({ bucket: "upload", max: 60 }), receiveQuotationEvidence, submitBid);
router.get("/my-quotations", requirePermission("bidding.submitBid"), listMyQuotations);
const receiveEligibilityEvidence = (req, res, next) => upload.single("file")(req, res, (error) => error ? res.status(400).json({ message: describeUploadError(error) }) : next());
router.post("/bids/:bidId/eligibility-evidence", requirePermission("bidding.submitBid"), rateLimit({ bucket: "upload", max: 60 }), receiveEligibilityEvidence, submitSvpEligibilityEvidence);
router.post("/rfqs/:id/open", requirePermission("bidding.publish"), openBids);

router.get(
  "/rfqs/:id/bids",
  requireAnyPermission("bidding.view", "bidding.evaluate", "bidding.technicalInput"),
  listBidsForRfq
);

// ── Evaluation ──────────────────────────────────────────────────────────────
router.post(
  "/bids/:bidId/evaluations",
  requirePermission("bidding.evaluate"),
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
router.post("/awards/:id/receipt", requirePermission("bidding.publish"), recordAwardReceipt);

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
