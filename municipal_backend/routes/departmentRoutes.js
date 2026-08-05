import express from "express";
import {
  listDepartments,
  listOfficeDirectory,
  createDepartment,
  updateDepartment,
} from "../controllers/departmentController.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// The narrower read the note below asks for: names and codes of the active
// offices, for any *signed-in* user filling in a form that has to name one.
//
// Mounted before the administrator gate, which is the only thing making it
// reachable — moving it below would silently make it admin-only again. It
// carries its own `requireAuth` for the same reason in reverse: nothing else on
// this path authenticates it, so without this the office list would be readable
// by anybody who could reach the port.
router.get("/directory", requireAuth, listOfficeDirectory);

// Design doc Section 2.3: departmental configuration is System Administrator
// only. Other roles that need to *read* the department list (e.g. to populate
// a form) get /directory above rather than this router.
router.use(requireRole("systemAdministrator"));

router.get("/", listDepartments);
router.post("/", createDepartment);
router.patch("/:id", updateDepartment);

export default router;
