import { missingOptionalValue, placeholderAnswer } from "./procurementInformation.js";
import { workflowError } from "./workflowSupport.js";
import { isFy2025HistoricalAward } from "./historicalAwards.js";

export const evidenceStages = [
  { key: "planning", label: "Planning and funding", screen: "Annual Procurement Plan", requirement: "Confirm the investment program link, applicable funding authority, procurement mode, budget, schedule and plan approval." },
  { key: "requisition", label: "Purchase requisition", screen: "Purchase Requisitions", requirement: "Check the requested items, estimates, useful life and required date. Follow endorsement, certification, approval and obligation in order." },
  { key: "solicitation", label: "Solicitation and bid opening", screen: "RFQ / ITB", requirement: "Review the approved schedule, applicable posting period, pre-bid requirements and bid opening record." },
  { key: "contacts", label: "Optional contact details", screen: "RFQ / ITB", requirement: "Record optional contact details when supplied. A supplier account still follows the normal email and eligibility process.", allowNotApplicable: true },
  { key: "supplier", label: "Supplier identity and bid documents", screen: "Supplier Registry and RFQ / ITB", requirement: "Compare registered names and supporting references. Record conflicting names verbatim and resolve identity before using the supplier in an official decision." },
  { key: "evaluation", label: "Evaluation and post-qualification", screen: "Bid Evaluation", requirement: "Check the required eligibility, technical and financial findings, including the applicable evaluation method and committee decisions." },
  { key: "award", label: "Award and supplier receipt", screen: "Award Queue", requirement: "Check the BAC recommendation, approving authority, Notice of Award and supplier receipt against the source documents." },
  { key: "contract", label: "Contract and notice to proceed", screen: "Contracts", requirement: "Check the signed contract, applicable performance security, contract period and Notice to Proceed." },
  { key: "acceptance", label: "Delivery and acceptance", screen: "Contracts", requirement: "Check delivery, inspection and acceptance records, plus warranty security where applicable." },
  { key: "completion", label: "Payment and project closeout", screen: "Invoices and Project Financials", requirement: "Check the invoice, certifications, payment release and approved financial closeout." },
];

const statuses = new Map([
  ["reported", "Reported / unverified"], ["reported / unverified", "Reported / unverified"],
  ["pending", "Pending"], ["not available", "Not Available"], ["not provided", "Not Available"],
  ["n/a", "Not Applicable"], ["na", "Not Applicable"], ["not applicable", "Not Applicable"],
  ["none", "None"],
]);

const evidenceText = (value, label, max) => {
  if (value == null) return "";
  if (typeof value !== "string" || value.trim().length > max) throw workflowError(`${label} must be text of at most ${max} characters.`, 400);
  return value.trim();
};

export const evidenceUpdate = (key, body = {}, { clientConfirmation = false } = {}) => {
  if (key === "reported-status") {
    const value = evidenceText(body.value, "Client-reported status", 200);
    const source = evidenceText(body.source, "Source reference", 500);
    if (!value && !source) return null;
    if (!value || placeholderAnswer(value) || missingOptionalValue(source) || placeholderAnswer(source)) throw workflowError("Enter the client-reported status and its source reference.", 400);
    return { value, source };
  }
  const stage = evidenceStages.find((item) => item.key === key);
  if (!stage) throw workflowError("Unknown evidence stage.", 404);
  const response = evidenceText(body.status, "Evidence status", 40);
  const note = evidenceText(body.note, "Evidence note", 4000);
  if (!response && !note) return null;
  const status = statuses.get(response.toLowerCase()) ?? (clientConfirmation && response === "Client-confirmed" ? response : null);
  if (!status) throw workflowError("Choose a valid evidence status.", 400);
  if (!stage.allowNotApplicable && ["Not Applicable", "None"].includes(status)) throw workflowError("Use Pending or Not Available for missing evidence at this stage.", 400);
  if (status === "Client-confirmed") {
    const source = evidenceText(body.source, "Client confirmation reference", 500);
    if (!note || placeholderAnswer(note) || !source || placeholderAnswer(source)) throw workflowError("Enter the confirmed field and value and cite the client's confirmation.", 400);
    return { status, note, source };
  }
  return { status, note };
};

export const procurementEvidence = (entry, entries = {}) => ({
  stages: evidenceStages,
  entries,
  acceptsClientConfirmation: isFy2025HistoricalAward(entry),
  officialStatus: entry.status,
  sourceStatus: entry.recoveryImport?.sourceStatus ?? null,
  sourceReference: entry.recoveryImport?.reviewedForm?.filename ?? entry.recoveryImport?.source?.filename ?? (typeof entry.recoveryImport?.source === "string" ? entry.recoveryImport.source : null),
  supplierMismatch: entry.recoveryImport?.supplierMismatch === true,
  conflictingSupplierNames: entry.recoveryImport?.supplierMismatch === true ? {
    registered: entry.recoveryImport.historicalAward?.registeredSupplier ?? null,
    recommended: entry.recoveryImport.historicalAward?.recommendedSupplier ?? null,
  } : null,
  hasHistoricalCompletionScenario: Boolean(entry.recoveryImport?.demonstrationCompletion),
  hasRecoveryHold: entry.recoveryImport?.hold === true,
});
