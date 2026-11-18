import { Op } from "sequelize";
import { loadCurrentUser, permissionsOf } from "../middleware/permissionMiddleware.js";

export const ACADEMIC_PROJECT_KEY = "academic:2026:GSO-2026-014";
export const ACADEMIC_SOLICITATION = "PB-2026-031";
export const ACADEMIC_IMPORT_ACTION = "data.academic.workflow.imported";
export const CLIENT_STATUS_CONFIRMATION_ACTION = "data.project.clientStatus.confirmed";

export const outsideAcademicCase = {
  [Op.or]: [{ recoveryKey: null }, { recoveryKey: { [Op.ne]: ACADEMIC_PROJECT_KEY } }],
};

const outsideAcademicSolicitation = {
  [Op.or]: [{ referenceNo: null }, { referenceNo: { [Op.ne]: ACADEMIC_SOLICITATION } }],
};

export async function canViewAcademicCase(req) {
  if (!req.session?.userId) return false;
  const user = await loadCurrentUser(req);
  if (!user) return false;
  const permissions = permissionsOf(user);
  return permissions.has("app.view") || permissions.has("audit.viewAll");
}

export function solicitationVisibility(includeAcademic) {
  return includeAcademic ? {} : outsideAcademicSolicitation;
}
