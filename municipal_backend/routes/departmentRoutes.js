import express from "express";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
} from "../controllers/departmentController.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Design doc Section 2.3: departmental configuration is System Administrator
// only. Other roles that need to *read* the department list (e.g. to populate
// a form) should get a narrower endpoint rather than this router.
router.use(requireRole("systemAdministrator"));

router.get("/", listDepartments);
router.post("/", createDepartment);
router.patch("/:id", updateDepartment);

export default router;
