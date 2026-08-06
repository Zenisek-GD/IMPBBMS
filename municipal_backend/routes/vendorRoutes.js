import express from "express";
import {
  getMyVendorProfile,
  recordCounterSubmission,
  listVendors,
  reviewVendor,
  reviewVendorDocument,
  createBidderAccount,
  resendBidderInvitation,
  blacklistVendor,
  liftBlacklist,
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
// Readable by all three offices in the onboarding chain, for different reasons:
// the BAC Secretariat needs it to record submissions and check the papers, the
// BAC itself needs it to rule on eligibility, and Admin/IT needs it to see which
// approved registrations are still waiting for an account. None of them can do
// another's job — that is enforced on the routes below, not here.
router.get(
  "/",
  requireAnyPermission("bidding.publish", "vendor.determineEligibility", "bidders.createAccount"),
  listVendors
);

// ── Counter intake ──────────────────────────────────────────────────────────
// How a paper submission enters the system: keyed in by the officer who received
// it. This is the replacement for the public intake form, and the reason it is
// safe where that was delicate — the caller is an authenticated officer whose
// name goes on the record, not an anonymous request from the internet.
router.post("/", requirePermission("bidding.publish"), recordCounterSubmission);

// ── The eligibility determination ───────────────────────────────────────────
// GPM Volume 1, "Responsibilities of the BAC", item iv: "Determine the
// eligibility of prospective bidders." This is the committee's decision, so it
// is the Chairperson's and Vice-Chairperson's — not the Secretariat's, which
// held it until now and was therefore making a committee determination on its
// own signature.
router.post("/:id/review", requirePermission("vendor.determineEligibility"), reviewVendor);

// Document-by-document findings, which is the evidence the determination above
// is made on. This stays with the Secretariat: checking that each paper answers
// the requirement it is filed against is custody and record-keeping, which the
// GPM gives to the Secretariat as "central depository" and keeper of the
// registry. The committee then rules on the file the Secretariat assembled —
// and `reviewVendor` refuses to verify a registration whose documents have not
// all been examined, so the two acts stay in the right order.
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

// ── Blacklisting (RA 12009 Sec. 69) ─────────────────────────────────────────
// The Head of the Procuring Entity issues Blacklisting Orders, so this sits
// with `bidding.award` rather than with the Secretariat that reviews
// accreditations. Barring a firm from all government procurement is not a
// clerical act.
router.post("/:id/blacklist", requirePermission("bidding.award"), blacklistVendor);
router.post("/:id/blacklist/lift", requirePermission("bidding.award"), liftBlacklist);

export default router;
