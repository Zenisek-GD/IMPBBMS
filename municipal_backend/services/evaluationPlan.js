import { EvaluationPlan } from "../models/evaluationWorkflowModel.js";
import { evaluationPlanError } from "./evaluationPolicy.js";
import { workflowError } from "./workflowSupport.js";

export const assertApprovedEvaluationPlan = async (rfq, { transaction } = {}) => {
  if (rfq.category !== "consulting") return null;
  const plan = await EvaluationPlan.findOne({ where: { rfqId: rfq.id }, transaction });
  const error = evaluationPlanError(plan);
  if (error || plan.status !== "approved" || !plan.approvedById || !plan.approvedAt) throw workflowError(error || "BAC approval of the consulting evaluation criteria is required before bidding begins.");
  if (Number(plan.qualityWeight) !== Number(rfq.qualityWeight) || Number(plan.financialWeight) !== Number(rfq.financialWeight) || Number(plan.passingScore) !== Number(rfq.consultingPassingScore)) throw workflowError("The procurement weights do not match the approved evaluation plan. An authorized amendment is required.");
  return plan;
};
