import { workflowError } from "./workflowSupport.js";

// A blank answer is distinct from an explicit No. Never use Boolean(value)
// on form data: Boolean("false") and Boolean("no") are both true.
export const procurementAnswer = (value, label) => {
  if (value == null || value === "") return null;
  if (value === true || value === "true" || value === "yes") return true;
  if (value === false || value === "false" || value === "no") return false;
  throw workflowError(`${label}: select Yes or No.`, 400);
};

export const placeholderAnswer = (value) => typeof value === "string"
  && /^(?:n\/?a|not\s+applicable|none|no)(?:\s*[-–—:.].*)?$/i.test(value.trim());

export const justificationError = ({ status, text, applicable, label }) => {
  if (status != null && status !== "" && !["provided", "notApplicable"].includes(status)) return `${label}: select a valid response.`;
  if (status === "notApplicable" && applicable) return `${label} applies to this selection and cannot be marked Not Applicable.`;
  if (status === "notApplicable" && text?.trim()) return `${label}: clear the explanation when selecting Not Applicable.`;
  if ((applicable || status === "provided") && (typeof text !== "string" || !text.trim() || placeholderAnswer(text))) return `Provide an explanation for ${label.toLowerCase()}.`;
  return null;
};

export const postQualificationError = ({ result, checklist, remarks }) => {
  if (!["passed", "failed"].includes(result)) return "Result must be passed or failed.";
  const checks = ["legal", "technical", "financial"].map((key) => checklist?.[key]);
  if (checks.some((value) => !["ok", "failed"].includes(value))) return "Record legal, technical and financial findings with explicit verification results. These mandatory checks cannot be marked Not Applicable.";
  if (result === "passed" && checks.some((value) => value !== "ok")) return "All mandatory verifications must be compliant before post-qualification can pass.";
  if (result === "failed" && !checks.includes("failed")) return "A failed post-qualification must identify a failed verification.";
  if (result === "failed" && (typeof remarks !== "string" || !remarks.trim() || placeholderAnswer(remarks))) return "Remarks are required when a bidder fails post-qualification.";
  return null;
};

export const SOLICITATION_FIELDS = ["openingVenue", "procurementContactPerson", "procurementContactEmail", "requiredSupplierDocuments"];
export const solicitationInformation = (body) => {
  const fields = {};
  for (const key of SOLICITATION_FIELDS) {
    if (!Object.hasOwn(body, key)) continue;
    const value = body[key];
    if (value != null && typeof value !== "string") throw workflowError(`Enter text for ${key}.`, 400);
    const cleaned = value?.trim() || null;
    if (cleaned && cleaned.length > (key === "requiredSupplierDocuments" ? 8000 : 255)) throw workflowError(`The ${key} value is too long.`, 400);
    fields[key] = cleaned;
  }
  if (fields.procurementContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.procurementContactEmail)) throw workflowError("Enter a valid procurement contact email, or leave it blank if it is not provided.", 400);
  return fields;
};

export const validDateOnly = (value) => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime())
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
