import express from "express";
import {
  listUsers,
  listRoles,
  createUser,
  updateUser,
  resetUserPassword,
} from "../controllers/userController.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { resetUserMfa } from "../controllers/mfaController.js";

const router = express.Router();

// Design doc Section 2.3: User Management is System Administrator only.
router.use(requireRole("systemAdministrator"));

router.get("/roles", listRoles);
router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:id", updateUser);
router.post("/:id/reset-password", resetUserPassword);

// The way back in for a user who lost both their phone and their recovery
// codes. It CLEARS the enrolment and nothing else — it cannot reveal a secret,
// set one, or sign anybody in, so a compromised administrator account gains no
// path into another account beyond forcing them to enrol again. Reason required
// and audited.
router.post("/:userId/mfa/reset", resetUserMfa);

export default router;
