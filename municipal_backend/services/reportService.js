import { Op } from "sequelize";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { PrHeader } from "../models/prModel.js";
import { Rfq, Bid, Evaluation, Award, BidOpeningRecord, PostQualification } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Contract } from "../models/contractModel.js";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { AuditLog } from "../models/auditLogModel.js";
import { BacResolution } from "../models/bacResolutionModel.js";
import { TwgAssessment } from "../models/twgModel.js";
import { ProcurementAttempt, NegotiatedReview } from "../models/procurementAttemptModel.js";
import { bidDisclosure, planScope, anyPermission } from "./reportPolicy.js";

const iso = (value) => value ? new Date(value).toISOString() : null;
const yearOf = (value) => value ? Number(new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 4)) : null;
const number = (value) => value == null ? null : Number(value);
const columns = (keys) => keys.map((key) => ({ key, label: LABELS[key] || key, type: ["amount", "abc", "score", "qualityScore", "financialScore", "combinedScore"].includes(key) ? "number" : "text" }));
const LABELS = {
  reference: "Reference", project: "Procurement project", category: "Category", method: "Procurement method", status: "Status",
  department: "Office / department", year: "Year", date: "Record date / time", abc: "Approved budget", amount: "Amount (PHP)",
  attempt: "Attempt", outcome: "Outcome", deadline: "Submission deadline", opening: "Bid opening", publication: "Published",
  bidder: "Bidder", score: "Evaluation score", evaluator: "Evaluator", qualityScore: "Quality score", financialScore: "Financial score",
  combinedScore: "Combined score", recommendation: "TWG recommendation", declaration: "No conflict declared", declaredAt: "Declaration time",
  requirements: "Technical compliance", remarks: "Remarks / justification", action: "BAC action", resolution: "Resolution number",
  participants: "BAC participants / position / attendance", quorum: "Quorum met", failureReason: "Failure reason", nextAction: "Next action",
  reviewer: "Reviewed by", legalBasis: "Policy reference", contract: "Contract number", completion: "Completion date", stage: "Stage",
  actor: "Responsible user", role: "Role", entity: "Module / record", summary: "Action details", sequence: "Audit sequence", hash: "Integrity hash",
};
const COMMON = ["reference", "project", "category", "method", "department", "year", "status", "attempt", "date"];
const SOURCE_COLUMNS = {
  procurement: [...COMMON, "abc", "outcome", "deadline", "opening"],
  plans: ["reference", "project", "department", "year", "category", "method", "status", "abc", "date"],
  bids: [...COMMON, "bidder", "amount", "outcome"],
  evaluations: [...COMMON, "bidder", "evaluator", "score", "qualityScore", "financialScore", "combinedScore", "remarks"],
  twg: [...COMMON, "bidder", "evaluator", "recommendation", "declaration", "declaredAt", "requirements", "remarks"],
  bac: [...COMMON, "action", "resolution", "participants", "quorum", "remarks"],
  attempts: [...COMMON, "outcome", "failureReason", "resolution", "nextAction", "actor", "deadline", "opening"],
  negotiated: [...COMMON, "reviewer", "legalBasis", "resolution", "remarks"],
  contracts: [...COMMON, "contract", "bidder", "amount", "outcome", "completion"],
  timeline: [...COMMON, "stage", "outcome"],
  audit: ["sequence", "date", "actor", "role", "action", "entity", "outcome", "summary", "hash"],
};

export const columnsForReport = (report) => columns(SOURCE_COLUMNS[report.source]);
const rfqIncludes = [
  { model: ProcurementMode, as: "mode" },
  { model: AppEntry, as: "appEntry", include: [{ model: Department, as: "implementingUnit" }] },
  { model: PrHeader, as: "purchaseRequisition", include: [{ model: Department, as: "department" }, { model: AppEntry, as: "appEntry" }] },
];
const rfqInclude = { model: Rfq, as: "rfq", include: rfqIncludes, required: true };
const outcomeOf = (status) => ["awarded", "active", "completed", "issued", "accepted"].includes(status) ? "successful" : ["failed", "technicalFailed", "postDisqualified"].includes(status) ? "failed" : ["cancelled", "rescinded"].includes(status) ? "cancelled" : "ongoing";

function procurementRow(rfq, attemptMap) {
  const app = rfq.appEntry || rfq.purchaseRequisition?.appEntry;
  const attempt = attemptMap.get(Number(rfq.id));
  return {
    id: `rfq-${rfq.id}`, reference: rfq.referenceNo, project: rfq.title, category: rfq.category,
    method: rfq.mode?.name || rfq.mode?.key || app?.procurementMode || "", department: rfq.appEntry?.implementingUnit?.name || rfq.purchaseRequisition?.department?.name || "",
    year: app?.fiscalYear || yearOf(rfq.createdAt), status: rfq.status, date: iso(rfq.createdAt), abc: number(rfq.abc),
    attempt: attempt?.attemptNumber ?? 1, outcome: outcomeOf(rfq.status), deadline: iso(rfq.closingDate), opening: iso(rfq.openingDate),
  };
}

export async function loadReportRows(report, user, permissions) {
  const source = report.source;
  if (source === "plans") {
    const scope = planScope(user, permissions);
    const where = {};
    if (scope.publishedOnly) where.status = { [Op.in]: ["approved", "locked"] };
    if (scope.departmentId != null) where.implementingUnitId = scope.departmentId;
    const entries = await AppEntry.findAll({ where, include: [{ model: Department, as: "implementingUnit" }] });
    return entries.map((entry) => ({ id: `plan-${entry.id}`, reference: entry.papCode || `APP-${entry.id}`, project: entry.projectTitle, department: entry.implementingUnit?.name || "", year: entry.fiscalYear, category: entry.category, method: entry.procurementMode, status: entry.status, abc: number(entry.abc), date: iso(entry.createdAt) }));
  }
  if (source === "audit") {
    const logs = await AuditLog.findAll({ attributes: ["id", "sequence", "recordedAt", "actorName", "actorRole", "actionType", "entityRef", "entityId", "outcome", "summary", "hash"], order: [["sequence", "DESC"]] });
    return logs.map((entry) => ({ id: entry.id, sequence: entry.sequence, date: iso(entry.recordedAt), year: yearOf(entry.recordedAt), actor: entry.actorName, role: entry.actorRole, action: entry.actionType, entity: `${entry.entityRef || ""} #${entry.entityId || ""}`, outcome: entry.outcome, summary: entry.summary, hash: entry.hash }));
  }

  const attempts = await ProcurementAttempt.findAll({ include: [{ model: BacResolution, as: "resolution" }, { model: User, as: "responsibleUser", attributes: ["id", "name"] }] });
  const attemptMap = new Map(attempts.map((attempt) => [Number(attempt.rfqId), attempt]));
  const base = (rfq) => procurementRow(rfq, attemptMap);

  if (source === "contracts") {
    const where = {};
    if (!permissions.has("contract.view") && permissions.has("delivery.submitInvoice")) {
      const vendor = await Vendor.findOne({ where: { userId: user.id }, attributes: ["id"] });
      if (!vendor) return [];
      where.vendorId = vendor.id;
    }
    if (!permissions.has("contract.view") && permissions.has("contract.viewPublished")) where.status = { [Op.in]: ["active", "completed"] };
    const contracts = await Contract.findAll({ where, include: [{ model: Vendor, as: "vendor", attributes: ["businessName"] }, { model: Award, as: "award", include: [rfqInclude], required: true }] });
    return contracts.map((entry) => ({ ...base(entry.award.rfq), id: `contract-${entry.id}`, contract: entry.contractNo, status: entry.status, date: iso(entry.createdAt), bidder: entry.vendor?.businessName, amount: number(entry.amount), completion: iso(entry.actualCompletionAt), outcome: outcomeOf(entry.status) }));
  }

  if (["bids", "evaluations", "twg"].includes(source)) {
    const bidInclude = { model: Bid, as: "bid", required: true, include: [rfqInclude, { model: Vendor, as: "vendor", attributes: ["businessName"] }] };
    if (source === "bids") {
      const bids = await Bid.findAll({ include: [rfqInclude, { model: Vendor, as: "vendor", attributes: ["businessName"] }] });
      return bids.map((bid) => ({ ...base(bid.rfq), id: `bid-${bid.id}`, ...bidDisclosure(bid, bid.rfq), status: bid.status, date: iso(bid.submittedAt), outcome: outcomeOf(bid.status) }));
    }
    if (source === "evaluations") {
      const entries = await Evaluation.findAll({ include: [bidInclude, { model: User, as: "evaluator", attributes: ["name"] }] });
      return entries.map((entry) => {
        const disclosure = bidDisclosure(entry.bid, entry.bid.rfq);
        const consulting = entry.bid.rfq.category === "consulting";
        return { ...base(entry.bid.rfq), id: `evaluation-${entry.id}`, bidder: disclosure.bidder, evaluator: entry.evaluator?.name, date: iso(entry.submittedAt), score: number(entry.score), qualityScore: consulting ? number(entry.bid.qualityScore) : null, financialScore: consulting && !disclosure.blind && !entry.bid.financialSealed ? number(entry.bid.financialScore) : null, combinedScore: consulting && !disclosure.blind && !entry.bid.financialSealed ? number(entry.bid.combinedScore) : null, remarks: disclosure.blind ? "Withheld during blind evaluation" : entry.remarks };
      });
    }
    // Submitted assessments are visible to BAC; a member's draft is private.
    const where = { [Op.or]: [{ status: "submitted" }, { memberId: user.id }] };
    const assessments = await TwgAssessment.findAll({ where, include: [bidInclude, { model: User, as: "member", attributes: ["name"] }] });
    return assessments.map((entry) => {
      const disclosure = bidDisclosure(entry.bid, entry.bid.rfq);
      return { ...base(entry.bid.rfq), id: `twg-${entry.id}`, bidder: disclosure.bidder, evaluator: entry.member?.name, status: entry.status, date: iso(entry.submittedAt || entry.updatedAt), recommendation: entry.recommendation, declaration: entry.noConflictDeclared ? "Yes" : "No", declaredAt: iso(entry.declaredAt), requirements: (entry.requirements || []).map((requirement) => disclosure.blind ? requirement.complianceStatus || requirement.status : `${requirement.requirement || requirement.name || "Requirement"}: ${requirement.complianceStatus || requirement.status || ""}`).join("; "), remarks: disclosure.blind ? "Technical text available in authorized evaluation workspace" : entry.remarks };
    });
  }

  const rfqs = await Rfq.findAll({ include: rfqIncludes });
  const rfqMap = new Map(rfqs.map((rfq) => [Number(rfq.id), rfq]));
  if (source === "procurement") return rfqs.map(base);
  if (source === "timeline") {
    const rows = rfqs.flatMap((rfq) => [
      ["Planning", (rfq.appEntry || rfq.purchaseRequisition?.appEntry)?.createdAt], ["BAC plan recommendation", (rfq.appEntry || rfq.purchaseRequisition?.appEntry)?.modeRecommendedAt],
      ["Procurement preparation", rfq.createdAt], ["Publication", rfq.publishDate], ["Pre-bid conference schedule", rfq.prebidAt], ["Submission deadline", rfq.closingDate], ["Bid opening schedule", rfq.openingDate], ["Attempt completed", attemptMap.get(Number(rfq.id))?.completedAt],
    ].filter(([, date]) => date).map(([stage, date]) => ({ ...base(rfq), id: `timeline-${rfq.id}-${stage}`, stage, date: iso(date), outcome: new Date(date) > new Date() ? "scheduled" : "recorded" })));
    const [openings, technical, evaluations, qualifications, awards, decisions] = await Promise.all([
      BidOpeningRecord.findAll(), TwgAssessment.findAll({ where: { status: "submitted" }, include: [{ model: Bid, as: "bid", attributes: ["rfqId"] }] }),
      Evaluation.findAll({ include: [{ model: Bid, as: "bid", attributes: ["rfqId"] }] }), PostQualification.findAll({ include: [{ model: Bid, as: "bid", attributes: ["rfqId"] }] }),
      Award.findAll(), AuditLog.findAll({ where: { actionType: { [Op.in]: ["evaluation.closed", "award.approved"] } }, attributes: ["id", "actionType", "entityRef", "entityId", "recordedAt", "outcome"] }),
    ]);
    const append = (entry, rfqId, stage, at, outcome = "recorded") => {
      const rfq = rfqMap.get(Number(rfqId));
      if (rfq && at) rows.push({ ...base(rfq), id: `timeline-${stage}-${entry.id}`, stage, date: iso(at), outcome });
    };
    openings.forEach((entry) => append(entry, entry.rfqId, "Actual bid opening", entry.openedAt));
    technical.forEach((entry) => append(entry, entry.bid?.rfqId, "TWG assessment submitted", entry.submittedAt));
    evaluations.forEach((entry) => append(entry, entry.bid?.rfqId, "BAC evaluation submitted", entry.submittedAt));
    decisions.forEach((entry) => {
      if (entry.entityRef === "rfq" && entry.actionType === "evaluation.closed") append(entry, entry.entityId, "BAC evaluation finalized", entry.recordedAt);
      if (entry.entityRef === "award" && entry.outcome !== "denied") append(entry, awards.find((award) => award.id === entry.entityId)?.rfqId, "Award approved", entry.recordedAt, "successful");
    });
    qualifications.forEach((entry) => append(entry, entry.bid?.rfqId, "Post-qualification", entry.verifiedAt, entry.result));
    awards.forEach((entry) => { append(entry, entry.rfqId, "Award recommendation", entry.createdAt); append(entry, entry.rfqId, "Award disapproved", entry.disapprovedAt, "returned"); });
    return rows;
  }
  if (source === "attempts") {
    // Include legacy solicitations without backfilled history without altering them.
    return rfqs.filter((rfq) => report.key === "failed-procurement" ? rfq.status === "failed" : (attemptMap.get(Number(rfq.id))?.attemptNumber || 1) > 1).map((rfq) => {
      const attempt = attemptMap.get(Number(rfq.id));
      return { ...base(rfq), status: attempt?.status || rfq.status, failureReason: attempt?.failureReason || rfq.cancellationReason, resolution: attempt?.resolution?.resolutionNo, nextAction: attempt?.nextAction, actor: attempt?.responsibleUser?.name, date: iso(attempt?.completedAt || attempt?.startedAt || rfq.createdAt) };
    });
  }
  if (source === "negotiated") {
    const reviews = await NegotiatedReview.findAll({ include: [{ model: ProcurementAttempt, as: "sourceAttempt" }] });
    return reviews.filter((entry) => rfqMap.has(Number(entry.sourceAttempt?.rfqId))).map((entry) => ({ ...base(rfqMap.get(Number(entry.sourceAttempt.rfqId))), id: `review-${entry.id}`, status: entry.status, reviewer: entry.reviewerId ? `User #${entry.reviewerId}` : "", legalBasis: entry.legalBasis, resolution: entry.bacResolutionId ? `BAC record #${entry.bacResolutionId}` : "", remarks: entry.justification, date: iso(entry.reviewedAt || entry.createdAt) }));
  }
  if (source === "bac") {
    const [resolutions, bids, awards, decisions] = await Promise.all([
      BacResolution.findAll({ where: { entityRef: { [Op.in]: ["rfq", "bid", "award"] } } }),
      Bid.findAll({ attributes: ["id", "rfqId"] }), Award.findAll({ attributes: ["id", "rfqId"] }),
      AuditLog.findAll({ where: { actionType: "evaluation.closed", entityRef: "rfq" }, attributes: ["id", "entityId", "recordedAt", "afterState"] }),
    ]);
    const bidMap = new Map(bids.map((bid) => [Number(bid.id), bid.rfqId]));
    const awardMap = new Map(awards.map((award) => [Number(award.id), award.rfqId]));
    const rows = resolutions.flatMap((entry) => {
      const rfqId = entry.entityRef === "rfq" ? entry.entityId : (entry.entityRef === "bid" ? bidMap : awardMap).get(Number(entry.entityId));
      const rfq = rfqMap.get(Number(rfqId));
      if (!rfq) return [];
      // Resolution text can name bidders. Keep the blind on this surface too.
      const blind = !["evaluated", "awarded"].includes(rfq.status);
      return [{ ...base(rfq), id: `resolution-${entry.id}`, action: entry.type, resolution: entry.resolutionNo, quorum: entry.quorumMet ? "Yes" : "No", participants: (entry.members || []).map((member) => `${member.name} (${member.position || member.role || "Member"}) - ${member.present === false ? "Absent" : "Present"}`).join("; "), remarks: blind ? "Resolution text available in authorized workflow record" : entry.recitals, date: iso(entry.resolvedAt) }];
    });
    for (const entry of decisions) {
      const rfq = rfqMap.get(Number(entry.entityId));
      if (rfq) rows.push({ ...base(rfq), id: `bac-decision-${entry.id}`, action: "Evaluation finalized", quorum: entry.afterState?.quorum?.ok ? "Yes" : "Not recorded", participants: (entry.afterState?.members || []).map((member) => `${member.name} (${member.position || member.role || "Member"}) - ${member.present === false ? "Absent" : "Present"}`).join("; "), date: iso(entry.recordedAt) });
    }
    return rows;
  }
  return [];
}
