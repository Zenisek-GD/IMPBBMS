import { workflowError } from "./workflowSupport.js";
import { missingOptionalValue, placeholderAnswer } from "./procurementInformation.js";

export const SVP_ELIGIBILITY_DUE_STAGES = ["offer", "evaluation", "beforeAward"];

export const svpRequirementsFrom = (body, modeKey, { draft = false } = {}) => {
  if (modeKey !== "smallValueProcurement") return {};
  const technicalSpecifications = missingOptionalValue(body?.svpTechnicalSpecifications) ? null : body.svpTechnicalSpecifications;
  if ((!draft || technicalSpecifications != null) && (typeof technicalSpecifications !== "string" || technicalSpecifications.trim().length < 20 || placeholderAnswer(technicalSpecifications))) {
    throw workflowError("State the SVP technical specifications, quantities, delivery terms and required eligibility documents.", 400);
  }
  const dueStage = missingOptionalValue(body?.svpEligibilityDueStage) ? null : body.svpEligibilityDueStage;
  if ((!draft || dueStage != null) && !SVP_ELIGIBILITY_DUE_STAGES.includes(dueStage)) throw workflowError("Choose when the RFQ requires eligibility documents: with the quotation, during evaluation, or before the award notice.", 400);
  return { svpTechnicalSpecifications: technicalSpecifications?.trim() ?? null, svpEligibilityDueStage: dueStage };
};
