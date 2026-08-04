import express from "express";
import {
  verifyActivationLink,
  setupActivation,
  confirmActivation,
  resendActivationCode,
} from "../controllers/activationController.js";
import { rateLimit } from "../middleware/rateLimitMiddleware.js";

// ── ACTIVATION ──────────────────────────────────────────────────────────────
// Unauthenticated by necessity: the person here has no account to sign in with —
// that is what they are trying to bring into being. The activation token in the
// request is the credential, and it authorises exactly one pending account, once.
//
// These are mounted OUTSIDE /api/public deliberately. The public prefix means
// "published procurement information, readable by the world"; this is a
// credentialed flow that happens to carry its credential in a link rather than a
// cookie, and filing it under "public" would misdescribe it to the next person
// reading the route table.
const router = express.Router();

// Each route gets its own ceiling.
//
// The 64-bit-plus token is not guessable, so these limits are not what stops
// enumeration — they stop a broken client, or someone with one valid link, from
// hammering the endpoints or using the resend paths to generate mail.
router.get("/verify", rateLimit({ bucket: "activationVerify", max: 60 }), verifyActivationLink);
router.post("/setup", rateLimit({ bucket: "activationSetup", max: 15 }), setupActivation);

// The tighter one: this is the endpoint a code is submitted to. The per-challenge
// attempt ceiling in services/otp.js is the real defence against guessing a code
// — five wrong answers void the challenge outright — and this sits on top of it so
// the same client cannot cheaply cycle through fresh challenges.
router.post("/confirm", rateLimit({ bucket: "activationConfirm", max: 20 }), confirmActivation);
router.post("/resend-code", rateLimit({ bucket: "activationResend", max: 8 }), resendActivationCode);

export default router;
