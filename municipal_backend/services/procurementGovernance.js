import { Op } from "sequelize";
import { Rfq, Bid, Evaluation, BidOpeningRecord } from "../models/biddingModel.js";
import { PrHeader } from "../models/prModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { Vendor } from "../models/vendorModel.js";
import { sequelize } from "../models/db.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { ProcurementAttempt, NegotiatedReview } from "../models/procurementAttemptModel.js";
import { BacResolution } from "../models/bacResolutionModel.js";
import { Document, DOCUMENT_METADATA_ATTRIBUTES } from "../models/documentModel.js";
import { getProcurementPolicy } from "../models/systemSettingModel.js";
import { BAC_ROLE_KEYS, PRESIDING_ROLE_KEYS, evaluateBacQuorum } from "./bacCommittee.js";
import { workflowError } from "./workflowSupport.js";
import { negotiatedEligibility } from "./attemptPolicy.js";

export const committeeSnapshot = ({ committee, present }) => committee.map((member) => ({
  userId: member.id, name: member.name, role: member.Role?.key ?? member.role, position: member.position,
  present: present.some((attendee) => attendee.id === member.id),
  concurred: present.some((attendee) => attendee.id === member.id),
}));

export const getBacContext = async (req = {}, { transaction } = {}) => {
  const policy = await getProcurementPolicy({ transaction });
  const candidates = await User.findAll({ where: { status: "active" }, attributes: ["id", "name", "roleId"],
    include: [{ model: Role, where: { key: { [Op.in]: BAC_ROLE_KEYS } }, attributes: ["key", "name"] }],
    order: [["id", "ASC"]], transaction });
  const selected = policy.memberIds.length ? candidates.filter((user) => policy.memberIds.includes(user.id)) : candidates;
  let memberIndex = 0;
  const committee = [...selected].sort((a, b) => BAC_ROLE_KEYS.indexOf(a.Role.key) - BAC_ROLE_KEYS.indexOf(b.Role.key)).map((member) => ({
    id: member.id, name: member.name, Role: { key: member.Role.key }, role: member.Role.key,
    position: member.Role.key === "bacChairperson" ? "BAC Chairperson" : member.Role.key === "bacViceChairperson" ? "BAC Vice-Chairperson" : `BAC Member ${++memberIndex}`,
  }));
  const ids = Array.isArray(req.body?.attendingMemberIds) ? req.body.attendingMemberIds.map(Number) : [];
  const present = ids.map((id) => committee.find((member) => member.id === id) ?? { id, role: "unknown" });
  const presidingId = req.body?.presidingMemberId ? Number(req.body.presidingMemberId) : req.currentUser?.id;
  const quorum = evaluateBacQuorum({ designated: committee, present, presidingId, policy });
  return { committee, present, quorum, policy, presidingId, candidates: candidates.map((member) => ({ id: member.id, name: member.name, role: member.Role.key })) };
};

export const assertBacAction = async (req, options = {}) => {
  const context = await getBacContext(req, options);
  if (!context.quorum.ok) throw workflowError(context.quorum.message, 409, { quorum: context.quorum });
  // A presiding officer finalizing their own act must actually be present.
  if (PRESIDING_ROLE_KEYS.includes(req.currentUser?.Role?.key) && !context.present.some((member) => member.id === req.currentUser.id)) {
    throw workflowError("The BAC officer recording this decision must be included in attendance.", 409);
  }
  return context;
};

export const projectKeyFor = (rfq) => rfq.prHeaderId ? `pr:${rfq.prHeaderId}` : rfq.appEntryId ? `app:${rfq.appEntryId}` : `rfq:${rfq.id}`;
export const projectScopeFor = (rfq) => rfq.prHeaderId ? { prHeaderId: rfq.prHeaderId } : rfq.appEntryId ? { appEntryId: rfq.appEntryId } : { id: rfq.id };
export const lockProcurementProject = async (scope, transaction) => {
  if (!transaction) return;
  if (scope.prHeaderId) await PrHeader.findByPk(scope.prHeaderId, { transaction, lock: transaction.LOCK.UPDATE });
  else if (scope.appEntryId) await AppEntry.findByPk(scope.appEntryId, { transaction, lock: transaction.LOCK.UPDATE });
  else if (scope.id) await Rfq.findByPk(scope.id, { transaction, lock: transaction.LOCK.UPDATE });
};

export const assertNewAttemptAllowed = async ({ prHeaderId, appEntryId, modeKey, transaction }) => {
  if (!prHeaderId && !appEntryId) throw workflowError("A procurement project is required.", 400);
  await lockProcurementProject({ prHeaderId, appEntryId }, transaction);
  if (String(modeKey).toLowerCase().includes("negotiated")) throw workflowError("Negotiated Procurement cannot proceed. Complete the required failed-attempt history, eligibility review and BAC approval, then use Start Negotiated Procurement.");
  const existing = await Rfq.findOne({ where: prHeaderId ? { prHeaderId } : { appEntryId }, order: [["id", "DESC"]], transaction });
  if (existing && existing.status !== "cancelled") throw workflowError(existing.status === "failed" ? "This project has an existing failed attempt. Initiate Rebid from its attempt history to preserve the procurement process." : "This project already has a procurement attempt. Continue from its existing procurement history.");
};

export const ensureProcurementAttempt = async (rfq, { transaction, actorId = null } = {}) => {
  await lockProcurementProject(rfq, transaction);
  const records = await Rfq.findAll({ where: projectScopeFor(rfq), order: [["createdAt", "ASC"], ["id", "ASC"]], transaction });
  let selected;
  for (const [index, record] of records.entries()) {
    const [attempt] = await ProcurementAttempt.findOrCreate({ where: { rfqId: record.id }, transaction,
      defaults: { projectKey: projectKeyFor(record), attemptNumber: index + 1,
        status: record.status === "failed" ? "failed" : record.status === "awarded" ? "successful" : record.status === "cancelled" ? "cancelled" : "ongoing",
        failureReason: record.status === "failed" ? record.cancellationReason : null,
        nextAction: record.status === "failed" ? "Record failure evidence / Rebid" : null,
        startedAt: record.createdAt, completedAt: ["failed", "awarded", "cancelled"].includes(record.status) ? record.updatedAt : null,
        responsibleUserId: record.id === rfq.id ? actorId : record.publishedById,
        outcomeSnapshot: { referenceNo: record.referenceNo, title: record.title, legacyImported: record.id !== rfq.id || record.status !== "draft" }, supportingDocuments: [],
      } });
    if (record.id === rfq.id) selected = attempt;
  }
  return selected;
};

export const attemptsForProject = (rfq, { transaction } = {}) => ProcurementAttempt.findAll({ where: { projectKey: projectKeyFor(rfq) },
  include: [{ model: Rfq, as: "rfq", include: [{ model: ProcurementMode, as: "mode" }] }, { model: BacResolution, as: "resolution" }, { model: User, as: "responsibleUser", attributes: ["id", "name"] }], order: [["attemptNumber", "ASC"]], transaction });

export const assertNegotiatedEligibility = async (rfq, { transaction } = {}) => {
  const [attempts, policy] = await Promise.all([attemptsForProject(rfq, { transaction }), getProcurementPolicy({ transaction })]);
  const eligibility = negotiatedEligibility(attempts, policy);
  if (!eligibility.eligible) throw workflowError(`Negotiated Procurement cannot proceed. ${eligibility.missing[0]}`, 409, { missing: eligibility.missing, eligibility });
  return { attempts, policy, eligibility };
};

export const findNegotiatedReview = (attempt, { transaction } = {}) => NegotiatedReview.findOne({ where: { sourceAttemptId: attempt.id }, transaction });

export const normalizeSupportingDocuments = async (input, rfq, { transaction } = {}) => {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 30) throw workflowError("Provide at most 30 supporting document references.", 400);
  const output = [];
  for (const item of input) {
    const documentId = Number(typeof item === "number" ? item : item?.documentId);
    if (Number.isSafeInteger(documentId) && documentId > 0) {
      const document = await Document.findByPk(documentId, { attributes: DOCUMENT_METADATA_ATTRIBUTES, transaction });
      if (!document || document.entityRef !== "rfq" || document.entityId !== rfq.id) throw workflowError("Supporting files must belong to this procurement attempt.", 400);
      output.push({ documentId, name: document.filename, checksum: document.checksum, url: `/api/documents/${documentId}/download` });
    } else {
      const name = typeof item?.name === "string" ? item.name.trim() : "";
      const url = typeof item?.url === "string" ? item.url.trim() : "";
      let valid = false;
      try { const parsed = new URL(url); valid = parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { valid = false; }
      if (!name || name.length > 255 || !valid || url.length > 2000) throw workflowError("Each supporting document needs a title and a valid HTTPS document link, or an uploaded document ID.", 400);
      output.push({ name, url, referenceOnly: true });
    }
  }
  return output;
};

export const snapshotAttemptOutcome = async (rfq, { transaction } = {}) => {
  const bids = await Bid.findAll({ where: { rfqId: rfq.id }, attributes: ["id", "vendorId", "blindLabel", "status", "financialSealed", "totalBidPrice", "qualityScore", "financialScore", "combinedScore"], include: [{ model: Evaluation, as: "evaluations" }, { model: Vendor, as: "vendor", attributes: ["businessName"] }], transaction });
  const opening = await BidOpeningRecord.findOne({ where: { rfqId: rfq.id }, transaction });
  const TwgAssessment = sequelize.models.TwgAssessment;
  const twg = TwgAssessment && bids.length ? await TwgAssessment.findAll({ where: { bidId: { [Op.in]: bids.map((bid) => bid.id) }, status: "submitted" }, transaction }) : [];
  return { referenceNo: rfq.referenceNo, title: rfq.title, procurementModeId: rfq.procurementModeId,
    category: rfq.category, qualityWeight: rfq.qualityWeight, financialWeight: rfq.financialWeight,
    previousStatus: rfq.status, wasDisclosed: ["evaluated", "awarded"].includes(rfq.status),
    startDate: rfq.createdAt, closingDate: rfq.closingDate, openingDate: rfq.openingDate, actualOpeningAt: opening?.openedAt ?? null,
    participatingBidders: bids.map((bid) => ({ bidId: bid.id, vendorId: bid.vendorId, vendorName: bid.vendor?.businessName, blindLabel: bid.blindLabel, status: bid.status })),
    evaluationResult: bids.map((bid) => ({ bidId: bid.id, status: bid.status, qualityScore: bid.qualityScore, financialScore: bid.financialScore, combinedScore: bid.combinedScore, evaluations: bid.evaluations.map((evaluation) => evaluation.get({ plain: true })) })),
    twgRecommendations: twg.map((assessment) => assessment.get({ plain: true })),
  };
};
