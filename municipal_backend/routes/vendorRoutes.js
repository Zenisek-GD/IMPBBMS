import express from "express";
import {
  getMyVendorProfile,
  upsertMyVendorProfile,
  submitMyVendorProfile,
  listVendors,
  reviewVendor,
  createBidderAccount,
  resendBidderInvitation,
} from "../controllers/vendorController.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { rateLimit } from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

// A vendor manages only their own registration.
router.get("/me", requirePermission("bidding.submitBid"), getMyVendorProfile);
router.put("/me", requirePermission("bidding.submitBid"), upsertMyVendorProfile);
router.post("/me/submit", requirePermission("bidding.submitBid"), submitMyVendorProfile);

// The BAC Secretariat verifies registrations (Section 2.3, Vendor column).
router.get("/", requirePermission("bidding.publish"), listVendors);
router.post("/:id/review", requirePermission("bidding.publish"), reviewVendor);

// ── Bidder account creation ─────────────────────────────────────────────────
// Role-based access control on the act that grants system access: only a role
// holding `bidders.createAccount` reaches these, and the controller additionally
// refuses any registration an officer has not already verified.
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
