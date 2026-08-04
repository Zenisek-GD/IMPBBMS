import express from "express";
import {
  listUsers,
  listRoles,
  createUser,
  updateUser,
  resetUserPassword,
} from "../controllers/userController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Design doc Section 2.3: User Management is System Administrator only.
router.use(requireRole("systemAdministrator"));

router.get("/roles", listRoles);
router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:id", updateUser);
router.post("/:id/reset-password", resetUserPassword);

export default router;
