import { DevelopmentPlan, DevelopmentGoal, GOAL_STATUSES } from "../models/developmentPlanModel.js";
import { InvestmentProgram, AipEntry } from "../models/investmentProgramModel.js";
import { Department } from "../models/departmentModel.js";
import { workflowError } from "./workflowSupport.js";

export const assertPlanningPermission = (req, permission) => {
  if (!req.permissions?.has(permission)) throw workflowError("You do not have permission to perform this planning action.", 403);
};
export const planningSnapshot = (row) => row ? Object.fromEntries(Object.keys(row.constructor.getAttributes()).map((key) => [key, row.get(key)])) : null;
export const lockPlanningCycle = (transaction) => DevelopmentPlan.findAll({ attributes: ["id"], order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE });
export const lockPlan = async (id, transaction) => {
  const plan = await DevelopmentPlan.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!plan) throw workflowError("Development plan not found.", 404);
  return plan;
};
export const lockProgram = async (id, transaction) => {
  const found = await InvestmentProgram.findByPk(id, { attributes: ["id", "developmentPlanId"], transaction });
  if (!found) throw workflowError("Investment program not found.", 404);
  // Lock the plan before its programs, goals and entries in every write path.
  const plan = await lockPlan(found.developmentPlanId, transaction);
  const program = await InvestmentProgram.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  return { program, plan };
};
export const lockEntry = async (id, transaction) => {
  const found = await AipEntry.findByPk(id, { attributes: ["id", "investmentProgramId"], transaction });
  if (!found) throw workflowError("Investment program entry not found.", 404);
  const parents = await lockProgram(found.investmentProgramId, transaction);
  const entry = await AipEntry.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!entry) throw workflowError("Investment program entry not found.", 404);
  return { ...parents, entry };
};
export const goalProgressError = ({ currentStatus, nextStatus, reason }) => {
  if (!GOAL_STATUSES.includes(nextStatus)) return "Choose Active, Achieved or Dropped for the development goal.";
  if (nextStatus !== currentStatus && (typeof reason !== "string" || !reason.trim())) return "State the reason or progress update for changing this goal's status.";
  return null;
};
export const validateGoalLink = async (goalId, program, { transaction, allowInactive = false } = {}) => {
  const id = Number(goalId);
  if (!Number.isSafeInteger(id) || id <= 0) throw workflowError("Select the development goal this project pursues.", 400);
  const goal = await DevelopmentGoal.findByPk(id, { transaction, lock: transaction?.LOCK.UPDATE });
  if (!goal) throw workflowError("That development goal does not exist.", 400);
  if (goal.developmentPlanId !== program.developmentPlanId) throw workflowError("That goal belongs to a different development plan from the one this program implements.", 400);
  if (!allowInactive && goal.status !== "active") throw workflowError("Select an active development goal for this planned project.", 409);
  return goal;
};
export const validateImplementingUnit = async (input, { transaction } = {}) => {
  if (input == null || input === "") return null;
  const id = Number(input);
  if (!Number.isSafeInteger(id) || id <= 0) throw workflowError("Select an existing implementing office.", 400);
  const department = await Department.findByPk(id, { transaction });
  if (!department || department.status !== "active") throw workflowError("Select an active implementing office.", 400);
  return id;
};
