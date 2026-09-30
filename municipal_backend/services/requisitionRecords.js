import { Department } from "../models/departmentModel.js";
import { SystemSetting } from "../models/systemSettingModel.js";
import { workflowError } from "./workflowSupport.js";

export const APP_CENTRAL_PERMISSIONS = ["app.consolidate", "app.certify", "app.approve"];
export const PR_CENTRAL_PERMISSIONS = ["pr.certifyCash", "pr.certify", "pr.obligate", "pr.review", "pr.determineMode", "pr.approve"];
export const hasCentralAccess = (req, permissions) => permissions.some((permission) => req.permissions?.has(permission));

export const assertDepartmentScope = (req, departmentId, permissions, label = "record") => {
  if (hasCentralAccess(req, permissions)) return;
  if (!req.currentUser?.departmentId || Number(departmentId) !== Number(req.currentUser.departmentId)) throw workflowError(`You may only manage ${label} for your own department.`, 403);
};

export const activeDepartment = async (id, { transaction } = {}) => {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw workflowError("An implementing department is required.", 400);
  const department = await Department.findByPk(Number(id), { transaction });
  if (!department || department.status !== "active") throw workflowError("That implementing department is not available.", 400);
  return department;
};

export const recordState = (row) => row ? Object.fromEntries(Object.keys(row.constructor.getAttributes()).map((key) => [key, row.get(key)])) : null;

// A fiscal year may have no appropriation row yet; this unique settings row
// supplies a stable transaction mutex for enactment and reenactment.
export const lockAppropriationYear = async (fiscalYear, transaction) => {
  const key = `recordLock.appropriationYear.${Number(fiscalYear)}`;
  const [row] = await SystemSetting.findOrCreate({ where: { key }, defaults: { key, value: "transaction mutex", description: "Serializes appropriation enactment and reenactment for a fiscal year." }, transaction, lock: transaction.LOCK.UPDATE });
  await row.reload({ transaction, lock: transaction.LOCK.UPDATE });
};
