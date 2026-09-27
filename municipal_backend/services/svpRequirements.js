import { workflowError } from "./workflowSupport.js";

export const SVP_ELIGIBILITY_DUE_STAGES = ["offer", "evaluation", "beforeAward"];

export const svpRequirementsFrom = (body, modeKey) => {
  if (modeKey !== "smallValueProcurement") return {};
  const technicalSpecifications = typeof body?.svpTechnicalSpecifications === "string" ? body.svpTechnicalSpecifications.trim() : "";
  if (technicalSpecifications.length < 20) throw workflowError("State the SVP technical specifications, quantities, delivery terms and required eligibility documents before creating the request.", 400);
  const dueStage = body?.svpEligibilityDueStage;
  if (!SVP_ELIGIBILITY_DUE_STAGES.includes(dueStage)) throw workflowError("Choose when the RFQ requires eligibility documents: with the quotation, during evaluation, or before the award notice.", 400);
  return { svpTechnicalSpecifications: technicalSpecifications, svpEligibilityDueStage: dueStage };
};
