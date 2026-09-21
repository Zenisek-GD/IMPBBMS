export const scheduleError = (closingDate, openingDate, { required = true } = {}) => {
  const close = new Date(closingDate).getTime();
  if (!closingDate || !Number.isFinite(close)) return "Enter a valid bid submission deadline date and time.";
  if (!openingDate && !required) return null;
  const open = new Date(openingDate).getTime();
  if (!openingDate || !Number.isFinite(open)) return "Enter a valid bid opening date and time.";
  return open > close ? null : "Bid opening must be scheduled after the bid submission deadline.";
};

export const weightError = (qualityWeight, financialWeight) => {
  if ([qualityWeight, financialWeight].some((v) => v === null || v === "" || typeof v === "boolean" || !Number.isFinite(Number(v)))) {
    return "Enter numeric quality and financial/price weights.";
  }
  const quality = Number(qualityWeight), financial = Number(financialWeight);
  if (quality <= financial) return "Quality weighting must be higher than the financial/price weighting.";
  if (financial <= 0 || quality >= 100 || Math.abs(quality + financial - 100) > 0.000001) {
    return "Quality and financial/price weights must both be positive and total 100%.";
  }
  return null;
};

export const COMPLIANCE_STATUSES = ["compliant", "nonCompliant", "needsClarification"];
export const TWG_RECOMMENDATIONS = ["furtherEvaluation", "postQualification", "compliant", "nonCompliant", "disqualification"];
export const requirementsError = (requirements, { final = true, allowClarification = false } = {}) => {
  if (!Array.isArray(requirements) || (final && !requirements.length) || requirements.length > 100) return "Record at least one technical requirement (up to 100).";
  for (const row of requirements) {
    if (!row || typeof row.requirement !== "string" || !row.requirement.trim()) return "Enter the requirement being assessed.";
    if (!COMPLIANCE_STATUSES.includes(row.complianceStatus)) return "Choose Compliant, Non-Compliant, or Needs Clarification for each requirement.";
    if (row.complianceStatus === "needsClarification" && !allowClarification) return "Clarifications are not enabled in this procurement workflow. Record Pass or Fail.";
    if (final && (typeof row.findings !== "string" || !row.findings.trim())) return "Record technical findings for each requirement.";
    if (final && row.complianceStatus === "needsClarification") return "Resolve requirements that need clarification before submitting the TWG evaluation.";
  }
  return null;
};
export const assessmentCompliant = (assessment) => assessment.status === "submitted"
  && !assessment.excludedForConflict
  && assessment.requirements?.length > 0
  && assessment.requirements.every((row) => row.complianceStatus === "compliant")
  && !["nonCompliant", "disqualification"].includes(assessment.recommendation);

export const activeEvaluations = (evaluations = []) => evaluations.filter((row) => !row.status || row.status === "submitted");
export const technicalAverage = (evaluations = []) => {
  const active = activeEvaluations(evaluations);
  return active.length ? active.reduce((sum, row) => sum + Number(row.score), 0) / active.length : 0;
};
const round = (number) => Number(number.toFixed(4));
// Financial scores use the lowest technically responsive price as the baseline.
// Calculate once when envelopes open; later post-disqualification does not change scores.
export const combinedScores = ({ qualityScore, price, lowestPrice, qualityWeight, financialWeight }) => {
  const error = weightError(qualityWeight, financialWeight);
  if (error) throw new Error(error);
  if (![price, lowestPrice].every((v) => Number.isFinite(Number(v)) && Number(v) > 0) || Number(lowestPrice) > Number(price)) throw new Error("Responsive bid prices must be positive; the lowest price must not exceed the bid price.");
  if (!Number.isFinite(Number(qualityScore)) || Number(qualityScore) < 0 || Number(qualityScore) > 100) throw new Error("Quality scores must be between 0 and 100.");
  const financialScore = Number(lowestPrice) / Number(price) * 100;
  return { qualityScore: round(Number(qualityScore)), financialScore: round(financialScore), combinedScore: round(Number(qualityScore) * Number(qualityWeight) / 100 + financialScore * Number(financialWeight) / 100) };
};

export const COMPLIANCE_REQUIREMENTS = {
  goods: [
    { key: "eligibilityDocuments", label: "Eligibility documents" },
    { key: "technicalSpecifications", label: "Technical specifications" },
    { key: "requiredCertifications", label: "Required certifications" },
    { key: "bidSecurity", label: "Bid security" },
    { key: "deliveryRequirements", label: "Delivery and other mandatory requirements" },
  ],
  infrastructure: [
    { key: "eligibilityDocuments", label: "Eligibility documents" },
    { key: "technicalSpecifications", label: "Plans, specifications and scope of work" },
    { key: "requiredCertifications", label: "Contractor licenses and required certifications" },
    { key: "bidSecurity", label: "Bid security" },
    { key: "personnelEquipment", label: "Key personnel, equipment and construction schedule" },
  ],
};
export const FAILURE_REASONS = ["missingDocument", "technicalSpecification", "invalidEligibility", "nonResponsive", "exceedsBudget", "failedVerification", "other"];
const numeric = (value) => value !== "" && value !== null && typeof value !== "boolean" && Number.isFinite(Number(value));
export const evaluationPlanError = (plan) => {
  if (!plan) return "Approved consulting criteria must be configured and approved before publication.";
  const error = weightError(plan.qualityWeight, plan.financialWeight);
  if (error) return error;
  if (plan.financialMethod !== "lowestResponsivePrice") return "Select the approved lowest responsive price financial evaluation method.";
  if (!numeric(plan.passingScore) || Number(plan.passingScore) < 0 || Number(plan.passingScore) > 100) return "The consulting passing score must be between 0 and 100.";
  if (!Array.isArray(plan.criteria) || !plan.criteria.length || plan.criteria.length > 50) return "Define between 1 and 50 approved quality criteria.";
  const keys = new Set();
  for (const criterion of plan.criteria) {
    if (!criterion || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(criterion.key) || keys.has(criterion.key)) return "Each quality criterion needs a unique key starting with a letter.";
    keys.add(criterion.key);
    if (typeof criterion.name !== "string" || !criterion.name.trim()) return "Every quality criterion requires a name.";
    if (!numeric(criterion.maxScore) || Number(criterion.maxScore) <= 0 || !numeric(criterion.weight) || Number(criterion.weight) <= 0) return "Criterion maximum scores and weights must be positive numbers.";
    if (criterion.minimumScore != null && criterion.minimumScore !== "" && (!numeric(criterion.minimumScore) || Number(criterion.minimumScore) < 0 || Number(criterion.minimumScore) > Number(criterion.maxScore))) return "A criterion minimum must be between zero and its maximum score.";
  }
  return Math.abs(plan.criteria.reduce((sum, criterion) => sum + Number(criterion.weight), 0) - 100) > 0.000001 ? "Quality criterion weights must total 100%." : null;
};
export const consultingQualityScore = (breakdown, plan) => Number(plan.criteria.reduce((sum, criterion) => sum + Number(breakdown[criterion.key]) / Number(criterion.maxScore) * Number(criterion.weight), 0).toFixed(4));
export const consultingMinimumsMet = (breakdown, plan) => plan.criteria.every((criterion) => criterion.minimumScore == null || criterion.minimumScore === "" || Number(breakdown[criterion.key]) >= Number(criterion.minimumScore));
export const evaluationError = ({ category, criteriaBreakdown, verdict, remarks, failureReason, failureExplanation, plan }) => {
  if (!["goods", "infrastructure", "consulting"].includes(category)) return "The procurement category is not supported for evaluation.";
  if (category === "consulting") {
    if (verdict != null) return "Consulting results are determined from the approved quality criteria and minimum scores.";
    const planError = evaluationPlanError(plan);
    if (planError || plan.status !== "approved") return planError || "Consulting criteria must be approved before evaluation.";
    if (!criteriaBreakdown || Array.isArray(criteriaBreakdown) || typeof criteriaBreakdown !== "object" || !Object.keys(criteriaBreakdown).length) return "A technical/quality rubric breakdown is required for consulting services.";
    if (Object.keys(criteriaBreakdown).length !== plan.criteria.length || plan.criteria.some((criterion) => !Object.hasOwn(criteriaBreakdown, criterion.key))) return "Score every approved quality criterion exactly; additional or replacement criteria are not allowed.";
    if (plan.criteria.some((criterion) => !numeric(criteriaBreakdown[criterion.key]) || Number(criteriaBreakdown[criterion.key]) < 0 || Number(criteriaBreakdown[criterion.key]) > Number(criterion.maxScore))) return "Each quality score must be between zero and its approved maximum score.";
  } else {
    if (!["passed", "failed"].includes(verdict)) return "Goods and Infrastructure require a Compliant or Non-Compliant technical verdict.";
    if (!criteriaBreakdown || typeof criteriaBreakdown !== "object" || Array.isArray(criteriaBreakdown) || !Object.keys(criteriaBreakdown).length) return "Record the mandatory technical requirements examined.";
    if (COMPLIANCE_REQUIREMENTS[category].some((criterion) => !Object.hasOwn(criteriaBreakdown, criterion.key))) return "Complete every mandatory eligibility and technical compliance requirement.";
    const values = Object.values(criteriaBreakdown);
    if (values.some((value) => ![...COMPLIANCE_STATUSES, "passed", "failed", true, false].includes(value))) return "Use compliance statuses for Goods and Infrastructure requirements; quality-price scores do not apply.";
    if (values.includes("needsClarification")) return "Resolve technical clarifications before final evaluation.";
    if (verdict === "passed" && values.some((value) => ["nonCompliant", "failed", false].includes(value))) return "A bidder that fails a mandatory technical requirement cannot be declared compliant.";
    if (verdict === "failed" && (typeof remarks !== "string" || !remarks.trim())) return "State which mandatory requirement the bid failed.";
    if (verdict === "failed" && !FAILURE_REASONS.includes(failureReason)) return "Select a reason for failure or non-compliance.";
    if (verdict === "failed" && failureReason === "other" && (typeof failureExplanation !== "string" || !failureExplanation.trim())) return "Explain the Other failure reason.";
  }
  return null;
};
