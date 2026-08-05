import express from "express";
import {
  getMyVendorProfile,
  recordCounterSubmission,
  listVendors,
  reviewVendor,
  reviewVendorDocument,
  createBidderAccount,
  resendBidderInvitation,
} from "../controllers/vendorController.js";
import { requirePermission, requireAnyPermission } from "../middleware/permissionMiddleware.js";
import { rateLimit } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

// A bidder reads their own accreditation and nothing more.
//
// There is deliberately no PUT or POST here. Accreditation requirements are
// submitted on paper at the BAC office; the write endpoints a bidder used to have
// (`PUT /me`, `POST /me/submit`) were removed, because any online path for filing
// or amending requirements is the workflow this system does not use.
router.get("/me", requirePermission("bidding.submitBid"), getMyVendorProfile);

// ── The accreditation queue ─────────────────────────────────────────────────
// Readable by both offices in the onboarding chain, for different reasons: the
// BAC Secretariat needs it to review submissions, and Admin/IT needs it to see
// which approved registrations are still waiting for an account. Neither can do
// the other's job — that is enforced on the routes below, not here.
router.get(
  "/",
  requireAnyPermission("bidding.publish", "bidders.createAccount"),
  listVendors
);

// ── Counter intake ──────────────────────────────────────────────────────────
// How a paper submission enters the system: keyed in by the officer who received
// it. This is the replacement for the public intake form, and the reason it is
// safe where that was delicate — the caller is an authenticated officer whose
// name goes on the record, not an anonymous request from the internet.
router.post("/", requirePermission("bidding.publish"), recordCounterSubmission);

// Deciding on the registration belongs to the BAC Secretariat alone.
router.post("/:id/review", requirePermission("bidding.publish"), reviewVendor);

// Document-by-document findings, which is what the registration-level decision
// above is assembled from. Same permission: examining the papers and deciding on
// them are one job held by one office.
router.patch(
  "/:id/documents/:documentId/review",
  requirePermission("bidding.publish"),
  reviewVendorDocument
);

// ── Bidder account creation — Admin/IT only ─────────────────────────────────
// The act that grants system access. Only a role holding `bidders.createAccount`
// reaches these — which, by the matrix, is Admin/IT and nobody else — and the
// controller additionally refuses any registration the BAC has not verified.
// Two offices therefore have to act before a bidder can sign in: one to approve
// the papers, a different one to issue the credential.
//
// Rate limited despite being authenticated — each call sends an email, so the
// ceiling is about not turning an officer's console into a way to flood a
// mailbox, not about guessing.
router.post(
  "/:id/account",
  requirePermission("bidders.createAccount"),
  rateLimit({ bucket: "bidderAccount", max: 30 }),
  createBidderAccount
);
router.post(
  "/:id/account/resend-invitation",
  requirePermission("bidders.createAccount"),
  rateLimit({ bucket: "bidderInvite", max: 20 }),
  resendBidderInvitation
);

export default router;
