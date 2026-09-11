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
export const requirementsError = (requirements, { final = true } = {}) => {
  if (!Array.isArray(requirements) || (final && !requirements.length) || requirements.length > 100) return "Record at least one technical requirement (up to 100).";
  for (const row of requirements) {
    if (!row || typeof row.requirement !== "string" || !row.requirement.trim()) return "Enter the requirement being assessed.";
    if (!COMPLIANCE_STATUSES.includes(row.complianceStatus)) return "Choose Compliant, Non-Compliant, or Needs Clarification for each requirement.";
    if (final && (typeof row.findings !== "string" || !row.findings.trim())) return "Record technical findings for each requirement.";
    if (final && row.complianceStatus === "needsClarification") return "Resolve requirements that need clarification before submitting the TWG evaluation.";
  }
  return null;
};
export const assessmentCompliant = (assessment) => assessment.status === "submitted"
  && assessment.requirements?.length > 0
  && assessment.requirements.every((row) => row.complianceStatus === "compliant")
  && !["nonCompliant", "disqualification"].includes(assessment.recommendation);

export const technicalAverage = (evaluations = []) => evaluations.length
  ? evaluations.reduce((sum, row) => sum + Number(row.score), 0) / evaluations.length : 0;
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

export const evaluationError = ({ category, criteriaBreakdown, verdict, remarks }) => {
  if (category === "consulting") {
    if (!criteriaBreakdown || Array.isArray(criteriaBreakdown) || typeof criteriaBreakdown !== "object" || !Object.keys(criteriaBreakdown).length) return "A technical/quality rubric breakdown is required for consulting services.";
    if (Object.values(criteriaBreakdown).some((v) => v === "" || v === null || typeof v === "boolean" || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100)) return "Each quality criterion must be scored between 0 and 100.";
  } else {
    if (!["passed", "failed"].includes(verdict)) return "Goods and Infrastructure require a Compliant or Non-Compliant technical verdict.";
    if (!criteriaBreakdown || typeof criteriaBreakdown !== "object" || Array.isArray(criteriaBreakdown) || !Object.keys(criteriaBreakdown).length) return "Record the mandatory technical requirements examined.";
    const values = Object.values(criteriaBreakdown);
    if (values.some((value) => ![...COMPLIANCE_STATUSES, "passed", "failed", true, false].includes(value))) return "Use compliance statuses for Goods and Infrastructure requirements; quality-price scores do not apply.";
    if (values.includes("needsClarification")) return "Resolve technical clarifications before final evaluation.";
    if (verdict === "passed" && values.some((value) => ["nonCompliant", "failed", false].includes(value))) return "A bidder that fails a mandatory technical requirement cannot be declared compliant.";
    if (verdict === "failed" && !remarks?.trim()) return "State which mandatory requirement the bid failed.";
  }
  return null;
};
