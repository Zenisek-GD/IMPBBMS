import { Op } from "sequelize";
import { fundingIncludes, fundingYearCondition, fundingYearOf } from "../services/fundingYear.js";
import { readProcurementSchedule, assertApprovedSchedule, synchronizeSchedule } from "../services/procurementSchedule.js";
import { scheduleSnapshot, scheduleIsLocked, scheduleValidationError } from "../services/procurementSchedulePolicy.js";
import { assertApprovedEvaluationPlan } from "../services/evaluationPlan.js";
import { TwgAssessment } from "../models/twgModel.js";
import { ProcurementAttempt } from "../models/procurementAttemptModel.js";
import { failureStatusLabel } from "../services/attemptPolicy.js";
import { serializeAssessment } from "./twgController.js";
import { scheduleError, weightError, assessmentCompliant, activeEvaluations, technicalAverage, complianceRequirementsFor } from "../services/evaluationPolicy.js";
import { EvaluationPlan } from "../models/evaluationWorkflowModel.js";
import { workflowError, actorAudit } from "../services/workflowSupport.js";
import { assertBacAction, assertNewAttemptAllowed, assertNoPendingFailure, ensureProcurementAttempt, snapshotAttemptOutcome, committeeSnapshot } from "../services/procurementGovernance.js";
import { sequelize } from "../models/db.js";
import { Rfq, Bid, BidOpeningRecord, Evaluation, PostQualification, Award } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Vendor } from "../models/vendorModel.js";
import { Document, DOCUMENT_METADATA_ATTRIBUTES } from "../models/documentModel.js";
import { PrHeader } from "../models/prModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Appropriation } from "../models/appropriationModel.js";
import { ProjectAllocation } from "../models/budgetControlModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { BacResolution, nextResolutionNo } from "../models/bacResolutionModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { notifyByPermission, notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS, withAuditTransaction } from "../services/auditLog.js";
import { nextSequenceNo, withSequenceRetry } from "../services/sequenceNo.js";
import {
  suggestProcurementMode,
  requiresPrebidConference,
  minimumPostingDays,
  postingExemptionFor,
  procurementAmountError,
} from "../services/procurementThresholds.js";
import { checkVendorEligibility } from "../services/vendorEligibility.js";
import { svpQuotationsDisclosable } from "../services/svpDisclosure.js";
import { svpRequirementsFrom, SVP_ELIGIBILITY_DUE_STAGES } from "../services/svpRequirements.js";
import { checksumOf, safeFilename, validateFileContent } from "../services/documentStore.js";
import { parseListParams, pageEnvelope, searchCondition } from "../services/listQuery.js";
import { unresolvedProtestsFor } from "./protestController.js";
import { ObserverInvitation, ObserverOrganization } from "../models/observerModel.js";
import { issueOtp, verifyOtp, consumeTicket, serializeChallenge, maskEmail } from "../services/otp.js";
import {
  Security,
  SECURITY_FORMS,
  BID_SECURITY_RATES,
  requiredBidSecurity,
} from "../models/securityModel.js";

// Identities stay masked for the whole time scoring is open. The BAC
// Chairperson closing evaluation is what reveals them — see closeEvaluation().
const isBlindStage = (rfq) => !["evaluated", "awarded"].includes(rfq.status);

const rfqIncludes = {
  include: [
    { model: ProcurementAttempt, as: "attempt", attributes: ["id", "attemptNumber", "status"] },
    { model: ProcurementMode, as: "mode" },
    { model: PrHeader, as: "purchaseRequisition" },
    { model: User, as: "publishedBy", attributes: ["id", "name"] },
  ],
};

const serializeRfq = (rfq) => ({
  id: rfq.id,
  attemptNumber: rfq.attempt?.attemptNumber ?? null,
  statusLabel: rfq.status === "failed" && rfq.attempt ? failureStatusLabel(rfq.attempt.attemptNumber) : null,
  referenceNo: rfq.referenceNo,
  title: rfq.title,
  abc: Number(rfq.abc),
  category: rfq.category,
  svpTechnicalSpecifications: rfq.mode?.key === "smallValueProcurement" ? rfq.svpTechnicalSpecifications : null,
  svpEligibilityDueStage: rfq.mode?.key === "smallValueProcurement" ? rfq.svpEligibilityDueStage : null,
  publishDate: rfq.publishDate,
  ...scheduleSnapshot(rfq),
  scheduleApprovedAt: rfq.scheduleApprovedAt,
  schedulePublishedAt: rfq.schedulePublishedAt,
  closingDate: rfq.closingDate,
  openingDate: rfq.openingDate,
  qualityWeight: rfq.category === "consulting" ? Number(rfq.qualityWeight) : null,
  financialWeight: rfq.category === "consulting" ? Number(rfq.financialWeight) : null,
  consultingPassingScore: rfq.category === "consulting" ? Number(rfq.consultingPassingScore) : null,
  twgRequired: rfq.twgRequired,
  prHeaderId: rfq.prHeaderId,
  appEntryId: rfq.appEntryId,
  prebidRequired: rfq.prebidRequired,
  prebidAt: rfq.prebidAt,
  postingRequired: rfq.postingRequired,
  status: rfq.status,
  cancellationReason: rfq.cancellationReason,
  modeKey: rfq.mode?.key ?? null,
  modeName: rfq.mode?.name ?? null,
  prNumber: rfq.purchaseRequisition?.prNumber ?? null,
  publishedByName: rfq.publishedBy?.name ?? null,
});

// `viewer` decides how much of a bid is disclosed. During blind evaluation the
// vendor is replaced by the anonymous label and the price is withheld.
const serializeBid = (bid, { blind, includeFinancial, discloseQuotation = false }) => ({
  id: bid.id,
  rfqId: bid.rfqId,
  blindLabel: bid.blindLabel,
  status: bid.status,
  submittedAt: bid.submittedAt,
  remarks: blind ? null : bid.remarks,
  vendorId: blind ? null : bid.vendorId,
  vendorName: blind ? bid.blindLabel : (bid.vendor?.businessName ?? null),
  // IRR Sec. 58: the financial envelope is opened only after the technical
  // component is rated "passed".
  // SVP quotations are disclosed after the recorded opening under IRR 34.3(f).
  // The stored envelope flag is left intact for the existing evaluation flow.
  totalBidPrice: discloseQuotation || (includeFinancial && !bid.financialSealed) ? Number(bid.totalBidPrice) : null,
  financialSealed: bid.financialSealed,
  averageScore: activeEvaluations(bid.evaluations).length ? Number(technicalAverage(bid.evaluations).toFixed(2)) : null,
  evaluationCount: activeEvaluations(bid.evaluations).length,
  evaluations: (bid.evaluations ?? []).map((row) => ({ id: row.id, evaluatorId: row.evaluatorId, status: row.status, score: Number(row.score), criteriaBreakdown: row.criteriaBreakdown, remarks: row.remarks, submittedAt: row.submittedAt, noConflictDeclared: row.noConflictDeclared, declaredAt: row.declaredAt, failureReason: row.failureReason, failureExplanation: row.failureExplanation, requirementRemarks: row.requirementRemarks, recommendation: row.recommendation, supportingDocuments: row.supportingDocuments, evaluationPlanId: row.evaluationPlanId })),
  qualityScore: !blind && bid.qualityScore != null ? Number(bid.qualityScore) : null,
  financialScore: !blind && !bid.financialSealed && bid.financialScore != null ? Number(bid.financialScore) : null,
  combinedScore: !blind && !bid.financialSealed && bid.combinedScore != null ? Number(bid.combinedScore) : null,
  twgAssessments: (bid.twgAssessments ?? []).filter((row) => row.status === "submitted").map(serializeAssessment),
});

// ── RFQ / ITB ───────────────────────────────────────────────────────────────

const nextReference = (modeKey, transaction) => {
  const prefix = modeKey === "competitiveBidding" ? "ITB" : "RFQ";
  return nextSequenceNo(Rfq, "referenceNo", prefix, new Date().getFullYear(), { transaction });
};

const evaluationConfig = (body) => {
  const category = body.category ?? "goods";
  if (!["goods", "infrastructure", "consulting"].includes(category)) throw workflowError("Choose Goods, Infrastructure, or Consulting Services.", 400);
  const error = scheduleError(body.closingDate, body.openingDate);
  if (error) throw workflowError(error, 400);
  const qualityWeight = body.qualityWeight ?? 75;
  const financialWeight = body.financialWeight ?? 25;
  if (category === "consulting") {
    const error = weightError(qualityWeight, financialWeight);
    if (error) throw workflowError(error, 400);
  } else if (body.qualityWeight != null || body.financialWeight != null) {
    throw workflowError("Quality-price weights apply only to Consulting Services.", 400);
  }
  const consultingPassingScore = Number(body.consultingPassingScore ?? 60);
  if (!Number.isFinite(consultingPassingScore) || consultingPassingScore <= 0 || consultingPassingScore > 100) throw workflowError("The consulting technical passing score must be greater than zero and at most 100.", 400);
  return { openingDate: body.openingDate, qualityWeight: category === "consulting" ? Number(qualityWeight) : 75, financialWeight: category === "consulting" ? Number(financialWeight) : 25, consultingPassingScore, twgRequired: true };
};

export const updateRfqSchedule = async (req, res) => {
  const rfq = await withAuditTransaction(async (transaction, audit) => {
    const row = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw workflowError("Procurement not found.", 404);
    if (scheduleIsLocked(row)) throw workflowError("Published procurement dates cannot be directly edited. Request a schedule amendment.");
    if (["qualityWeight", "financialWeight", "consultingPassingScore"].some((key) => Object.hasOwn(req.body, key) && Number(req.body[key]) !== Number(row[key]))) throw workflowError("Configure and approve Consulting evaluation criteria in the approved evaluation plan, separately from the schedule.");
    const before = scheduleSnapshot(row);
    const values = readProcurementSchedule(req.body, { base: row, mandatoryPrebid: requiresPrebidConference(Number(row.abc), await getLguProfile(), row.category) });
    await row.update({ ...values, scheduleApprovedAt: null, scheduleApprovedById: null, schedulePreparedById: req.currentUser.id }, { transaction });
    await synchronizeSchedule(row, { transaction });
    const attempt = await ProcurementAttempt.findOne({ where: { rfqId: row.id }, transaction });
    await audit(actorAudit(req, { actionType: "rfq.scheduleChanged", entityRef: "rfq", entityId: row.id, summary: "Draft procurement schedule updated. Approval is required before publication.", beforeState: before, afterState: { ...values, attemptId: attempt?.id, attemptNumber: attempt?.attemptNumber } }));
    return row;
  });
  res.json({ ...serializeRfq(rfq), message: "Procurement schedule saved. Obtain schedule approval before publication." });
};

export const updateSvpTerms = async (req, res) => {
  const rfq = await withAuditTransaction(async (transaction, audit) => {
    const row = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE, include: [{ model: ProcurementMode, as: "mode" }] });
    if (!row) throw workflowError("Procurement not found.", 404);
    if (row.status !== "draft" || row.mode?.key !== "smallValueProcurement") throw workflowError("Only draft Small Value Procurement terms can be updated.", 409);
    const before = { svpTechnicalSpecifications: row.svpTechnicalSpecifications, svpEligibilityDueStage: row.svpEligibilityDueStage };
    const terms = svpRequirementsFrom(req.body, row.mode.key);
    await row.update(terms, { transaction });
    await audit(actorAudit(req, { actionType: "rfq.svpTermsChanged", entityRef: "rfq", entityId: row.id, summary: "Draft RFQ technical terms and eligibility-document timing updated.", beforeState: before, afterState: terms }));
    return row;
  });
  res.json({ ...serializeRfq(rfq), message: "Draft RFQ terms saved for review before publication." });
};

export const listRfqs = async (req, res) => {
  const { status, search } = req.query;
  const where = {};
  const funding = fundingIncludes();
  const listIncludes = { include: rfqIncludes.include.map(entry => entry.as === "purchaseRequisition" ? { ...entry, include: funding[0].include } : entry).concat(funding[1]) };
  const serialize = row => ({ ...serializeRfq(row), fiscalYear: fundingYearOf(row) });
  if (req.query.fiscalYear != null) {
    const scope = fundingYearCondition(req.query.fiscalYear, "");
    if (scope) where[Op.and] = [scope];
  }
  if (status) where.status = status;
  if (req.query.prebidRequired === "true" || req.query.prebidRequired === "false") where.prebidRequired = req.query.prebidRequired === "true";
  const searched = searchCondition(search, ["referenceNo", "title"]);
  if (searched) Object.assign(where, searched);

  // A vendor sees only what is actually open to bid on, never drafts.
  if (req.permissions.has("bidding.submitBid") && !req.permissions.has("bidding.publish")) {
    where.status = { [Op.in]: ["published", "closed"] };
  }
  // Observers see published records only (Section 2.2).
  if (req.permissions.has("bidding.viewPublished") && !req.permissions.has("bidding.view")) {
    where.status = { [Op.in]: ["awarded", "closed", "opened", "evaluated"] };
  }

  const paged = ["page", "pageSize", "sort"].some((key) => req.query[key] !== undefined);
  if (!paged) {
    const rfqs = await Rfq.findAll({ where, ...listIncludes, order: [["createdAt", "DESC"]] });
    return res.json(rfqs.map(serialize));
  }
  const page = parseListParams(req.query, {
    sorts: { referenceNo: "referenceNo", title: "title", abc: "abc", closingDate: "closingDate", openingDate: "openingDate", status: "status", createdAt: "createdAt" },
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const { count, rows } = await Rfq.findAndCountAll({ where, ...listIncludes, ...page, distinct: true, subQuery: false });
  res.json(pageEnvelope({ rows: rows.map(serialize), total: count, page: page.page, pageSize: page.pageSize }));
};

export const createRfq = async (req, res) => {
  const { prHeaderId, appEntryId, title, category, closingDate, procurementModeKey } = req.body;
  const config = evaluationConfig(req.body);

  // ── Two ways a solicitation can arise ──────────────────────────────────────
  // The ordinary route is an approved requisition. The other is an Early
  // Procurement Activity: RA 12009 lets a Procuring Entity conduct procurement
  // up to but NOT including award before the appropriation ordinance is
  // enacted, against the updated Indicative APP (IRR Sec. 7.7.4). There is no
  // requisition at that point because there is nothing yet to obligate.
  if (!prHeaderId && appEntryId) {
    return createEpaSolicitation(req, res);
  }

  const pr = await PrHeader.findByPk(prHeaderId);
  if (!pr) return res.status(400).json({ message: "That requisition does not exist." });

  // Lifecycle step 4: a requisition must be approved before it can be advertised.
  if (pr.status !== "approved") {
    return res.status(400).json({ message: "Only an approved requisition can be advertised." });
  }
  if (await Rfq.findOne({ where: { prHeaderId, status: { [Op.notIn]: ["cancelled", "failed"] } } })) {
    return res.status(409).json({ message: "This requisition already has an active RFQ/ITB." });
  }
  if (!closingDate) return res.status(400).json({ message: "A closing date is required." });

  const abc = Number(pr.totalAmount);
  const lgu = await getLguProfile();
  const suggestion = suggestProcurementMode(abc, lgu, category ?? "goods");

  // ── The mode is inherited, not chosen here ─────────────────────────────────
  // The BAC determines the mode on the requisition (step 19) before any
  // solicitation exists, and that determination is a recorded act with a date,
  // an officer and a justification behind it. Letting this form pick a
  // different mode would mean the document advertised to the public disagreed
  // with the decision the committee actually minuted.
  //
  // `procurementModeKey` is still accepted, but only to *confirm* the
  // determination — a mismatch is refused rather than silently overriding it.
  if (!pr.procurementModeId) {
    return res.status(409).json({
      message:
        "No mode of procurement has been determined for this requisition. The BAC must determine the mode before it can be advertised.",
    });
  }

  const mode = await ProcurementMode.findByPk(pr.procurementModeId);
  if (!mode) return res.status(409).json({ message: "The determined procurement mode no longer exists." });

  if (procurementModeKey && procurementModeKey !== mode.key) {
    return res.status(409).json({
      message: `The BAC determined ${mode.name} for ${pr.prNumber}. To advertise under a different mode, redetermine it on the requisition.`,
      determinedMode: mode.key,
    });
  }

  const modeKey = mode.key;
  const amountIssue = procurementAmountError(abc, modeKey, lgu, category ?? "goods");
  if (amountIssue) throw workflowError(amountIssue, 400);
  await assertNewAttemptAllowed({ prHeaderId: pr.id, modeKey });

  const rfq = await withSequenceRetry(() => withAuditTransaction(async (transaction, audit) => {
    // Serialize with financial closeout before creating any new procurement.
    await AppEntry.findByPk(pr.appEntryId, { transaction, lock: transaction.LOCK.UPDATE });
    const allocation = await ProjectAllocation.findOne({ where: { appEntryId: pr.appEntryId }, transaction });
    if (allocation?.status === "closed") throw workflowError("This project has an approved financial closeout and cannot start new procurement.");
    await assertNewAttemptAllowed({ prHeaderId: pr.id, modeKey: modeKey, transaction });
    const created = await Rfq.create({
      referenceNo: await nextReference(modeKey, transaction),
      title: title?.trim() || pr.purpose || `Procurement for ${pr.prNumber}`,
      abc,
      category: category ?? "goods",
      ...svpRequirementsFrom(req.body, modeKey),
      closingDate,
      ...config,
      ...readProcurementSchedule(req.body, { mandatoryPrebid: requiresPrebidConference(abc, lgu, category ?? "goods") }),
      schedulePreparedById: req.currentUser.id,
      postingRequired: modeKey !== "smallValueProcurement" || abc > postingExemptionFor(lgu, category ?? "goods"),
      prHeaderId,
      procurementModeId: mode.id,
      status: "draft",
    }, { transaction });
    const attempt = await ensureProcurementAttempt(created, { transaction, actorId: req.currentUser.id });
    await audit(actorAudit(req, { actionType: "rfq.created", entityRef: "rfq", entityId: created.id, summary: "Procurement preparation saved. Review the schedule before publication.", afterState: { attemptId: attempt.id, attemptNumber: attempt.attemptNumber, closingDate, ...config, ...(modeKey === "smallValueProcurement" ? { svpTechnicalSpecifications: created.svpTechnicalSpecifications, svpEligibilityDueStage: created.svpEligibilityDueStage } : {}) } }));
    return created;
  }));

  res.status(201).json({
    ...serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)),
    suggestion,
  });
};

// ── Early Procurement Activity (RA 12009; IRR Sec. 7.7.4) ───────────────────
// Procurement conducted before the appropriation ordinance is enacted, against
// the updated Indicative APP, and lawful only up to but not including award —
// which is enforced at `approveAward`, not here.
//
// This is one of the substantive things RA 12009 changed and the operational
// reason the indicative APP matters: without it an LGU cannot start buying
// until the ordinance is passed, and the first quarter of the year is lost.
const createEpaSolicitation = async (req, res) => {
  const { appEntryId, title, category, closingDate } = req.body;
  const config = evaluationConfig(req.body);

  const appEntry = await AppEntry.findByPk(appEntryId, {
    include: [{ model: Department, as: "implementingUnit" }],
  });
  if (!appEntry) return res.status(400).json({ message: "That APP entry does not exist." });

  if (appEntry.planCycle !== "indicative") {
    return res.status(409).json({
      message:
        "A final APP line is procured through a requisition, not an EPA solicitation. Raise a " +
        "Purchase Request against it instead.",
    });
  }
  if (!appEntry.earlyProcurement) {
    return res.status(409).json({
      message:
        "This indicative APP line is not flagged for Early Procurement. IRR Sec. 7.7.2(i) requires the " +
        "APP to indicate whether a project is to be undertaken through EPA before it can be.",
    });
  }
  // Sec. 7.7.4 — EPA runs against the *updated* Indicative APP, i.e. the one
  // revised to the Local Expenditure Program and approved. A line still in
  // draft has not been through the BAC or the HoPE.
  if (!["approved", "locked"].includes(appEntry.status)) {
    return res.status(409).json({
      message: "The indicative APP line must be approved before an EPA solicitation can be advertised.",
    });
  }
  if (await Rfq.findOne({ where: { appEntryId, status: { [Op.notIn]: ["cancelled", "failed"] } } })) {
    return res.status(409).json({ message: "This plan line already has an active solicitation." });
  }
  if (!closingDate) return res.status(400).json({ message: "A closing date is required." });

  const abc = Number(appEntry.abc);
  const lgu = await getLguProfile();
  const mode = await ProcurementMode.findOne({ where: { key: appEntry.procurementMode } });
  if (!mode) {
    return res.status(409).json({
      message: `The APP line specifies an unknown mode of procurement: ${appEntry.procurementMode}.`,
    });
  }

  const amountIssue = procurementAmountError(abc, mode.key, lgu, category ?? "goods");
  if (amountIssue) throw workflowError(amountIssue, 400);
  await assertNewAttemptAllowed({ appEntryId: appEntry.id, modeKey: mode.key });
  const rfq = await withSequenceRetry(() => withAuditTransaction(async (transaction, audit) => {
    await assertNewAttemptAllowed({ appEntryId: appEntry.id, modeKey: mode.key, transaction });
    const created = await Rfq.create({
      referenceNo: await nextReference(mode.key, transaction),
      title: title?.trim() || appEntry.projectTitle,
      abc,
      category: category ?? "goods",
      ...svpRequirementsFrom(req.body, mode.key),
      closingDate,
      ...config,
      ...readProcurementSchedule(req.body, { mandatoryPrebid: requiresPrebidConference(abc, lgu, category ?? "goods") }),
      schedulePreparedById: req.currentUser.id,
      postingRequired: mode.key !== "smallValueProcurement" || abc > postingExemptionFor(lgu, category ?? "goods"),
      appEntryId: appEntry.id,
      isEarlyProcurement: true,
      procurementModeId: mode.id,
      status: "draft",
    }, { transaction });
    const attempt = await ensureProcurementAttempt(created, { transaction, actorId: req.currentUser.id });
    await audit(actorAudit(req, { actionType: "rfq.created", entityRef: "rfq", entityId: created.id, summary: "Procurement preparation saved. Review the schedule before publication.", afterState: { attemptId: attempt.id, attemptNumber: attempt.attemptNumber, closingDate, ...config, ...(mode.key === "smallValueProcurement" ? { svpTechnicalSpecifications: created.svpTechnicalSpecifications, svpEligibilityDueStage: created.svpEligibilityDueStage } : {}) } }));
    return created;
  }));

  res.status(201).json({
    ...serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)),
    earlyProcurement: true,
    notice:
      "Early Procurement Activity. This solicitation may proceed through advertisement, opening and " +
      "evaluation, but no award may be made until the appropriation ordinance is enacted and the " +
      "plan line is finalised (RA 12009).",
  });
};

export const publishRfq = async (req, res) => {
  const rfq = await withAuditTransaction(async (transaction, audit) => {
    const row = await Rfq.findByPk(req.params.id, { ...rfqIncludes, transaction, lock: transaction.LOCK.UPDATE });
    if (!row) throw workflowError("RFQ/ITB not found.", 404);
    if (row.status !== "draft") throw workflowError(`Cannot publish from status "${row.status}".`);
    if (row.mode?.key === "smallValueProcurement" && (!row.svpTechnicalSpecifications?.trim() || !SVP_ELIGIBILITY_DUE_STAGES.includes(row.svpEligibilityDueStage))) throw workflowError("Complete the SVP technical specifications and eligibility-document timing before publication.", 400);
    assertApprovedSchedule(row);
    readProcurementSchedule({}, { base: row, mandatoryPrebid: requiresPrebidConference(Number(row.abc), await getLguProfile(), row.category) });
    await assertApprovedEvaluationPlan(row, { transaction });
    const now = new Date();
    if (new Date(row.closingDate) <= now) throw workflowError("The closing date must be in the future.", 400);
    if (row.prebidRequired && new Date(row.prebidAt) <= now) throw workflowError("The required pre-bid conference must be scheduled after publication.", 400);
    if (row.publicationStartAt && new Date(row.publicationStartAt) > now) throw workflowError("The approved publication start time has not yet arrived.");
    if (row.publicationEndAt && new Date(row.publicationEndAt) <= now) throw workflowError("The approved publication period has ended. Revise and approve the draft schedule before publication.");
    const minimumDays = minimumPostingDays(row);
    const earliestClose = new Date(now); earliestClose.setHours(0, 0, 0, 0); earliestClose.setDate(earliestClose.getDate() + minimumDays);
    if (minimumDays > 0 && new Date(row.closingDate) < earliestClose) throw workflowError(`${row.mode?.name ?? "This mode"} must stay open for at least ${minimumDays} calendar day(s) after posting. Move the closing date to ${earliestClose.toISOString().slice(0, 10)} or later.`, 400);
    await row.update({ status: "published", publishDate: now.toISOString().slice(0, 10), schedulePublishedAt: row.schedulePublishedAt ?? now, publishedById: req.currentUser.id, philgepsPostedAt: row.postingRequired ? now : null, philgepsReference: req.body?.philgepsReference?.trim() || null }, { transaction });
    await synchronizeSchedule(row, { transaction });
    const attempt = await ProcurementAttempt.findOne({ where: { rfqId: row.id }, transaction });
    const afterState = { status: "published", attemptId: attempt?.id, attemptNumber: attempt?.attemptNumber, schedule: scheduleSnapshot(row) };
    await audit(actorAudit(req, { actionType: "rfq.published", entityRef: "rfq", entityId: row.id, summary: "Procurement published using the approved official schedule.", beforeState: { status: "draft" }, afterState }));
    await audit(actorAudit(req, { actionType: "bidding.submissionOpened", entityRef: "rfq", entityId: row.id, summary: "Bid submission opened until the official deadline.", afterState }));
    if (row.prebidRequired) await audit(actorAudit(req, { actionType: "rfq.prebidScheduled", entityRef: "rfq", entityId: row.id, summary: "Required pre-bid conference schedule published.", afterState }));
    return row;
  });
  const verifiedVendors = await Vendor.findAll({ where: { registrationStatus: "verified" } });
  await notifyUsers(verifiedVendors.map((vendor) => vendor.userId), { type: NOTIFICATION_EVENTS.RFQ_PUBLISHED, title: `New opportunity: ${rfq.referenceNo}`, body: `${rfq.title}. Closes ${new Date(rfq.closingDate).toLocaleString()}.`, link: "/supplier/opportunities", refEntity: "rfq", refId: rfq.id, severity: "info" });
  res.json(serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)));
};

export const closeRfq = async (req, res) => {
  await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("RFQ/ITB not found.", 404);
    if (rfq.status !== "published") throw workflowError(`Cannot close from status "${rfq.status}".`);
    if (new Date() < new Date(rfq.closingDate)) throw workflowError(`Bidding closes ${new Date(rfq.closingDate).toLocaleString()}. Submission cannot close before its official deadline.`);
    await rfq.update({ status: "closed" }, { transaction });
    const attempt = await ProcurementAttempt.findOne({ where: { rfqId: rfq.id }, transaction });
    const afterState = { status: "closed", attemptId: attempt?.id, attemptNumber: attempt?.attemptNumber, closingDate: rfq.closingDate };
    await audit(actorAudit(req, { actionType: "bidding.deadlineReached", entityRef: "rfq", entityId: rfq.id, summary: "The official bid submission deadline has been reached.", afterState }));
    await audit(actorAudit(req, { actionType: "bidding.submissionClosed", entityRef: "rfq", entityId: rfq.id, summary: "Bid submission closed. Open bids at the official opening date and time.", beforeState: { status: "published" }, afterState }));
  });
  res.json(serializeRfq(await Rfq.findByPk(req.params.id, rfqIncludes)));
};

export const cancelRfq = async (req, res) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason || reason.length > 2000) return res.status(400).json({ message: "Enter a cancellation reason of at most 2,000 characters." });

  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { ...rfqIncludes, transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("RFQ/ITB not found.", 404);
    await assertNoPendingFailure(rfq, { transaction });
    if (["awarded", "cancelled", "failed"].includes(rfq.status)) throw workflowError("A completed or failed procurement attempt cannot be cancelled. Its outcome must remain in the history.");
    if (await Award.findOne({ where: { rfqId: rfq.id, status: { [Op.in]: ["pendingHopeApproval", "issued", "accepted"] } }, transaction })) throw workflowError("Resolve the award recommendation before cancelling this procurement.");

    const hasQuotations = await Bid.count({ where: { rfqId: rfq.id }, transaction }) > 0;
    const deadlineReached = rfq.status === "published" && new Date(rfq.closingDate) <= new Date();
    const requiresHopeDecision = hasQuotations || deadlineReached || !["draft", "published"].includes(rfq.status) ||
      (rfq.status === "published" && req.currentUser.Role?.key === "hope");
    let cancellationDecision = null;
    if (requiresHopeDecision) {
      if (req.currentUser.Role?.key !== "hope" || !req.permissions.has("bidding.award")) throw workflowError("Only the HoPE may withdraw a solicitation after quotations were received or opened.", 403);
      const factualFinding = typeof req.body?.factualFinding === "string" ? req.body.factualFinding.trim() : "";
      const decisionReference = typeof req.body?.decisionReference === "string" ? req.body.decisionReference.trim() : "";
      const supportingDocumentId = Number(req.body?.supportingDocumentId);
      if (!factualFinding || factualFinding.length > 4000) throw workflowError("Record the procedural defect and its effect on fair evaluation in at most 4,000 characters.", 400);
      if (!decisionReference || decisionReference.length > 255) throw workflowError("Enter the written HoPE decision reference in at most 255 characters.", 400);
      if (!Number.isSafeInteger(supportingDocumentId) || supportingDocumentId <= 0) throw workflowError("Attach the factual review note to this RFQ before recording the HoPE decision.", 400);
      const evidence = await Document.findByPk(supportingDocumentId, { attributes: DOCUMENT_METADATA_ATTRIBUTES, transaction });
      if (!evidence || evidence.entityRef !== "rfq" || Number(evidence.entityId) !== Number(rfq.id) || evidence.docType !== "rfqCancellationEvidence") throw workflowError("Select the factual review note attached to this RFQ.", 400);
      cancellationDecision = {
        legalBasis: "Approved 2025 IRR of RA 12009, Section 70(b)",
        action: "Reject quotations and do not award; withdraw defective solicitation",
        decisionReference,
        factualFinding,
        decidedById: req.currentUser.id,
        decidedByName: req.currentUser.name,
        decidedAt: new Date(),
        supportingDocument: { documentId: evidence.id, name: evidence.filename, checksum: evidence.checksum },
        supplierFault: false,
        priorAssessments: "Preserved as provisional records; no bidder is disqualified by this withdrawal",
      };
    } else if (!req.permissions.has("bidding.publish")) {
      throw workflowError("Only the publishing office may cancel a draft or an unanswered solicitation.", 403);
    }

    const beforeState = { status: rfq.status, hasQuotations, deadlineReached };
    const snapshot = await snapshotAttemptOutcome(rfq, { transaction });
    const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
    await rfq.update({ status: "cancelled", cancellationReason: reason }, { transaction });
    await attempt.update({
      status: "cancelled", completedAt: new Date(),
      nextAction: "Review procurement preparation before any new solicitation",
      outcomeSnapshot: { ...snapshot, cancellationReason: reason, cancellationDecision },
    }, { transaction });
    await audit(actorAudit(req, {
      actionType: requiresHopeDecision ? "rfq.withdrawnByHope" : "rfq.cancelled",
      entityRef: "rfq", entityId: rfq.id,
      summary: requiresHopeDecision ? "HoPE withdrew a procedurally defective solicitation without attributing fault to suppliers; the abstract, quotations and assessments remain in the history." : "Unanswered solicitation cancelled with a recorded reason.",
      beforeState, afterState: { status: "cancelled", reason, attemptNumber: attempt.attemptNumber, cancellationDecision },
    }));
    return { rfqId: rfq.id, referenceNo: rfq.referenceNo, wasPublished: beforeState.status !== "draft", requiresHopeDecision };
  });

  if (result.wasPublished) {
    try {
      // Publishing this RFQ notified every verified supplier; reach that same
      // audience and every respondent when the opportunity is withdrawn.
      const [registeredVendors, respondents] = await Promise.all([
        Vendor.findAll({ where: { registrationStatus: "verified" }, attributes: ["userId"] }),
        Bid.findAll({ where: { rfqId: result.rfqId }, include: [{ model: Vendor, as: "vendor", attributes: ["userId"] }] }),
      ]);
      await notifyUsers([...registeredVendors.map((vendor) => vendor.userId), ...respondents.map((bid) => bid.vendor?.userId)], {
        type: NOTIFICATION_EVENTS.RFQ_WITHDRAWN,
        title: `Opportunity withdrawn: ${result.referenceNo}`,
        body: result.requiresHopeDecision
          ? "The HoPE withdrew this solicitation because its published requirements were incomplete. Received quotations remain in the record and no supplier is disqualified by this withdrawal. Any replacement RFQ will have a new deadline."
          : "This solicitation was cancelled before quotations were received. Review new opportunities for any replacement RFQ.",
        link: "/supplier/opportunities", refEntity: "rfq", refId: result.rfqId, severity: "warning",
      });
    } catch (error) {
      // The official decision has committed; a notice failure must not turn it
      // into an apparent failed cancellation or tempt a duplicate decision.
      console.error("[rfq.cancel] supplier notification failed:", error.name);
    }
  }
  res.json({ ...serializeRfq(await Rfq.findByPk(result.rfqId, rfqIncludes)), message: result.requiresHopeDecision ? "HoPE withdrawal recorded. Quotations and provisional assessments remain in history without supplier fault. Review the project before any new RFQ." : "RFQ/ITB cancelled. Its attempt history remains available." });
};

// ── Bid submission ──────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Workflow requirement 14: step-up email verification before a bid is submitted.
//
// A bid is an irrevocable financial commitment — there is no edit path, only
// withdraw and resubmit, and the price binds the bidder if they win. Requiring a
// code sent to the accredited mailbox means a session left open on a shared
// machine is not by itself enough to commit a company to a tender.
//
// Both endpoints are scoped to the specific RFQ (contextRef/contextId), so a code
// confirmed for one opportunity cannot be spent submitting a bid on another.
// ─────────────────────────────────────────────────────────────────────────────

export const requestBidSubmissionCode = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  if (rfq.status !== "published") {
    return res.status(409).json({ message: "This opportunity is not open for bids." });
  }
  if (new Date() >= new Date(rfq.closingDate)) {
    return res.status(409).json({ message: "The deadline for submission has passed (IRR Sec. 54.6)." });
  }

  const issued = await issueOtp({
    user: req.currentUser,
    purpose: "bidSubmission",
    deliveredTo: req.currentUser.email,
    contextRef: "rfq",
    contextId: rfq.id,
  });
  if (!issued.ok) return res.status(issued.status).json({ message: issued.message });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.OTP_ISSUED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `Bid submission code issued to ${maskEmail(req.currentUser.email)} for ${rfq.referenceNo}`,
    afterState: { purpose: "bidSubmission", expiresAt: issued.expiresAt },
  });

  res.json({
    message: `We sent a 6-digit code to ${maskEmail(req.currentUser.email)}. It expires in ${issued.expiresInMinutes} minutes.`,
    challenge: serializeChallenge(issued),
  });
};

export const verifyBidSubmissionCode = async (req, res) => {
  const { reference, code } = req.body ?? {};
  const verification = await verifyOtp({
    reference,
    code,
    userId: req.currentUser.id,
    purpose: "bidSubmission",
  });

  if (!verification.ok) {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.OTP_FAILED,
      outcome: "denied",
      entityRef: "rfq",
      entityId: Number(req.params.id),
      summary: `Incorrect or expired bid submission code submitted by ${req.currentUser.name}`,
      afterState: { purpose: "bidSubmission" },
    });
    return res.status(verification.status).json({ message: verification.message });
  }

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.OTP_VERIFIED,
    entityRef: "rfq",
    entityId: Number(req.params.id),
    summary: `Bid submission code verified for ${req.currentUser.name}`,
    afterState: { purpose: "bidSubmission" },
  });

  res.json({
    verified: true,
    ticket: verification.ticket,
    reference,
    expiresAt: verification.ticketExpiresAt,
  });
};

export const submitBid = async (req, res) => {
  const {
    totalBidPrice,
    bidSecurityForm,
    bidSecurityReference,
    bidSecurityIssuer,
    reference,
    ticket,
  } = req.body;
  const rfq = await Rfq.findByPk(req.params.id);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  const mode = await ProcurementMode.findByPk(rfq.procurementModeId);
  if (!mode) return res.status(409).json({ message: "The procurement mode for this opportunity is unavailable." });
  const securityRequired = mode.key !== "smallValueProcurement" && mode.requiresBidSecurity;
  const isSmallValue = mode.key === "smallValueProcurement";
  const offerFile = req.files?.technicalOffer?.[0];
  const eligibilityFile = req.files?.eligibilityEvidence?.[0];
  if (!isSmallValue && (offerFile || eligibilityFile)) return res.status(400).json({ message: "SVP quotation files cannot be attached to this procurement mode." });
  if (isSmallValue) {
    if (!rfq.svpTechnicalSpecifications?.trim() || !SVP_ELIGIBILITY_DUE_STAGES.includes(rfq.svpEligibilityDueStage)) return res.status(409).json({ message: "This RFQ does not specify the technical terms and eligibility-document timing needed for quotation submission." });
    if (!offerFile) return res.status(400).json({ message: "Attach the signed technical offer or quotation for this RFQ." });
    if (rfq.svpEligibilityDueStage === "offer" && !eligibilityFile) return res.status(400).json({ message: "This RFQ requires the eligibility documents with the quotation." });
    for (const file of [offerFile, eligibilityFile].filter(Boolean)) {
      const contentError = validateFileContent(file);
      if (contentError) return res.status(400).json({ message: contentError });
    }
  }

  if (rfq.status !== "published") {
    return res.status(409).json({ message: "This opportunity is not open for bids." });
  }
  // IRR Sec. 54.6: bids submitted after the deadline are not accepted.
  if (new Date() >= new Date(rfq.closingDate)) {
    return res.status(409).json({ message: "The deadline for submission has passed (IRR Sec. 54.6)." });
  }

  const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
  if (!vendor) return res.status(400).json({ message: "Complete your vendor registration first." });
  if (vendor.registrationStatus !== "verified") {
    return res.status(403).json({ message: "Your registration must be verified before you can bid." });
  }

  // The PhilGEPS Platinum certificate is valid for one year. The expiry was
  // being stored and never read, so a supplier whose registration lapsed years
  // ago could bid and win normally.
  const eligibility = checkVendorEligibility(vendor);
  if (!eligibility.eligible) {
    return res.status(403).json({ message: eligibility.reason });
  }

  if (await Bid.findOne({ where: { rfqId: rfq.id, vendorId: vendor.id, status: { [Op.ne]: "withdrawn" } } })) {
    return res.status(409).json({ message: "You have already submitted a bid for this opportunity." });
  }

  const price = Number(totalBidPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ message: "A total bid price is required." });
  }

  // The ABC is a hard ceiling, not a target. A bid above it is disqualified
  // automatically — there is no discretion to accept it, no waiver, and no
  // later stage at which it could become eligible. Rejecting it at submission
  // rather than at evaluation is deliberate: it tells the bidder while they can
  // still revise, and it keeps an ineligible offer out of the opening record.
  //
  // Bid prices are immutable once submitted (there is no update path, only
  // withdraw and re-submit), so this single gate is sufficient — a bid that
  // passes here cannot later drift above the ceiling.
  if (price > Number(rfq.abc)) {
    return res.status(400).json({
      message:
        `A bid of ₱${price.toLocaleString()} exceeds the Approved Budget for the Contract ` +
        `of ₱${Number(rfq.abc).toLocaleString()}. Bids above the ABC are automatically ` +
        `disqualified and cannot be accepted.`,
      abc: Number(rfq.abc),
      submitted: price,
    });
  }

  // ── Bid security ───────────────────────────────────────────────────────────
  // SVP quotations do not require bid security. Other modes follow their
  // configured bid-security requirement and retain the existing form handling.
  const form = securityRequired ? bidSecurityForm ?? "suretyBond" : null;
  if (securityRequired && !SECURITY_FORMS.includes(form)) {
    return res.status(400).json({
      message: "Unknown bid security form.",
      accepted: SECURITY_FORMS,
    });
  }

  const requiredAmount = securityRequired ? requiredBidSecurity(rfq.abc, form) : null;

  // ── Email verification ────────────────────────────────────────────────────
  // Spent here, after every other check has passed, so a rejected bid does not
  // burn the bidder's verification and send them back for another code. Scoped to
  // this RFQ: a ticket earned against a different opportunity will not be
  // accepted.
  const bid = await withAuditTransaction(async (transaction, audit) => {
  await rfq.reload({ transaction, lock: transaction.LOCK.UPDATE });
  if (rfq.status !== "published" || new Date() >= new Date(rfq.closingDate)) {
    throw workflowError("Bid submissions are closed. Review the current approved procurement schedule.");
  }
  if (price > Number(rfq.abc)) throw workflowError("The bid exceeds the current approved budget.", 400);
  if (await Bid.findOne({ where: { rfqId: rfq.id, vendorId: vendor.id, status: { [Op.ne]: "withdrawn" } }, transaction })) {
    throw workflowError("You have already submitted a bid for this opportunity.");
  }
  const spent = await consumeTicket({
    reference,
    ticket,
    userId: req.currentUser.id,
    purpose: "bidSubmission",
    contextRef: "rfq",
    contextId: rfq.id,
    transaction,
  });
  if (!spent.ok) {
    throw workflowError("Bid submission must be confirmed with the code we email you. Request a new code and try again.", spent.status, { requiresOtp: true });
  }

  const submittedAt = new Date();
  const created = await Bid.create({
    rfqId: rfq.id,
    vendorId: vendor.id,
    technicalSubmitted: true,
    financialSealed: true, // stays sealed until the technical component passes
    totalBidPrice: price,
    submittedAt,
    status: "submitted",
  }, { transaction });

  const evidence = [];
  if (isSmallValue) {
    for (const [file, docType] of [[offerFile, "svpTechnicalOffer"], [eligibilityFile, "svpEligibilityEvidence"]]) {
      if (!file) continue;
      const document = await Document.create({
        filename: safeFilename(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        content: file.buffer,
        checksum: checksumOf(file.buffer),
        entityRef: "bid",
        entityId: created.id,
        docType,
        label: docType === "svpTechnicalOffer" ? "Submitted technical offer" : "Submitted eligibility evidence",
        uploadedById: req.currentUser.id,
        uploadedAt: submittedAt,
      }, { transaction });
      evidence.push({ documentId: document.id, docType, checksum: document.checksum, submittedAt });
    }
  }

  if (securityRequired) {
    // A Securing Declaration carries no deposit; its undertaking is the security.
    await Security.create({
      type: "bid",
      form,
      amount: requiredAmount,
      percentage: BID_SECURITY_RATES[form] ?? 0,
      referenceNo: bidSecurityReference ?? null,
      issuer: bidSecurityIssuer ?? null,
      postedAt: new Date(),
      validUntil: rfq.closingDate,
      status: "posted",
      entityRef: "bid",
      entityId: created.id,
      vendorId: vendor.id,
      recordedById: req.currentUser.id,
    }, { transaction });
  }

  // Workflow requirement 11: bid submissions.
  //
  // The price is recorded because the audit log is the accountability record for
  // exactly this — who committed what, when, from where — and a bid price is not a
  // secret from an auditor. It is a sealed figure as far as the *evaluation* is
  // concerned, which is enforced by the serialisers that mask bidder identities
  // and withhold financial envelopes until opening; the audit log is not part of
  // that surface, and access to it is itself permission-gated.
  const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
  await audit(actorAudit(req, {
    actionType: AUDIT_ACTIONS.BID_SUBMITTED,
    entityRef: "bid",
    entityId: created.id,
    summary: `${vendor.businessName} submitted a ${mode.key === "smallValueProcurement" ? "quotation" : "bid"} for ${rfq.referenceNo}`,
    afterState: {
      rfqId: rfq.id,
      rfqReference: rfq.referenceNo,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      status: "submitted",
      vendorId: vendor.id,
      businessName: vendor.businessName,
      totalBidPrice: price,
      abc: Number(rfq.abc),
      ...(securityRequired ? { bidSecurityForm: form, bidSecurityAmount: requiredAmount } : {}),
      ...(isSmallValue ? { evidence, eligibilityDueStage: rfq.svpEligibilityDueStage } : {}),
      // The fact of verification, not the code.
      emailVerified: true,
    },
  }));
  return created;
  });

  res.status(201).json({
    id: bid.id,
    status: bid.status,
    submittedAt: bid.submittedAt,
    ...(securityRequired
      ? { bidSecurity: { form, amount: requiredAmount, percentOfAbc: BID_SECURITY_RATES[form] ?? 0 } }
      : {}),
  });
};

export const listMyQuotations = async (req, res) => {
  const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
  if (!vendor) return res.json([]);
  const bids = await Bid.findAll({
    where: { vendorId: vendor.id, status: { [Op.ne]: "withdrawn" } },
    include: [{ model: Rfq, as: "rfq", include: [{ model: ProcurementMode, as: "mode" }] }],
    order: [["submittedAt", "DESC"]],
  });
  const svpBids = bids.filter((bid) => bid.rfq?.mode?.key === "smallValueProcurement");
  const evidence = svpBids.length ? await Document.findAll({
    where: { entityRef: "bid", entityId: { [Op.in]: svpBids.map((bid) => bid.id) }, docType: { [Op.in]: ["svpTechnicalOffer", "svpEligibilityEvidence"] } },
    attributes: DOCUMENT_METADATA_ATTRIBUTES,
  }) : [];
  res.json(svpBids.map((bid) => ({
    id: bid.id,
    rfqId: bid.rfqId,
    referenceNo: bid.rfq.referenceNo,
    title: bid.rfq.title,
    rfqStatus: bid.rfq.status,
    bidStatus: bid.status,
    submittedAt: bid.submittedAt,
    totalBidPrice: Number(bid.totalBidPrice),
    eligibilityDueStage: bid.rfq.svpEligibilityDueStage,
    evidence: evidence.filter((document) => document.entityId === bid.id).map(({ id, filename, checksum, docType, uploadedAt }) => ({ id, filename, checksum, docType, uploadedAt })),
  })));
};

export const submitSvpEligibilityEvidence = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Attach the eligibility document bundle." });
  const contentError = validateFileContent(req.file);
  if (contentError) return res.status(400).json({ message: contentError });
  const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
  if (!vendor) return res.status(403).json({ message: "A verified supplier account is required." });
  const document = await withAuditTransaction(async (transaction, audit) => {
    const bid = await Bid.findByPk(req.params.bidId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!bid || bid.vendorId !== vendor.id) throw workflowError("This quotation is unavailable to your account.", 403);
    const rfq = await Rfq.findByPk(bid.rfqId, { include: [{ model: ProcurementMode, as: "mode" }], transaction });
    if (rfq?.mode?.key !== "smallValueProcurement" || bid.status === "withdrawn") throw workflowError("Eligibility evidence can be added only to your active SVP quotation.", 409);
    if (!SVP_ELIGIBILITY_DUE_STAGES.includes(rfq.svpEligibilityDueStage)) throw workflowError("This earlier RFQ did not state an eligibility-document due stage, so a late upload cannot be accepted.", 409);
    if (rfq.svpEligibilityDueStage === "offer") throw workflowError("This RFQ required eligibility evidence with the original quotation. Late files cannot be added.", 409);
    if (rfq.svpEligibilityDueStage === "evaluation" && rfq.status !== "opened") throw workflowError("Submit the eligibility evidence while quotation evaluation is open.", 409);
    if (rfq.svpEligibilityDueStage === "beforeAward" && !["opened", "evaluated"].includes(rfq.status)) throw workflowError("Eligibility evidence is accepted before the award notice is issued.", 409);
    if (rfq.status === "evaluated" && bid.status !== "technicalPassed") throw workflowError("Eligibility evidence after evaluation is accepted for quotations proceeding to supplier verification.", 409);
    if (await Document.findOne({ where: { entityRef: "bid", entityId: bid.id, docType: "svpEligibilityEvidence" }, transaction })) throw workflowError("Eligibility evidence is already submitted and cannot be replaced.", 409);
    const created = await Document.create({
      filename: safeFilename(req.file.originalname), mimeType: req.file.mimetype,
      sizeBytes: req.file.size, content: req.file.buffer, checksum: checksumOf(req.file.buffer),
      entityRef: "bid", entityId: bid.id, docType: "svpEligibilityEvidence", label: "Submitted eligibility evidence",
      uploadedById: req.currentUser.id, uploadedAt: new Date(),
    }, { transaction });
    await audit(actorAudit(req, { actionType: "bidding.eligibilityEvidenceSubmitted", entityRef: "bid", entityId: bid.id, summary: "Supplier submitted the RFQ-specific eligibility evidence.", afterState: { rfqId: rfq.id, documentId: created.id, checksum: created.checksum, uploadedAt: created.uploadedAt, dueStage: rfq.svpEligibilityDueStage } }));
    return created;
  });
  res.status(201).json({ id: document.id, checksum: document.checksum, uploadedAt: document.uploadedAt, message: "Eligibility evidence submitted and locked." });
};

// ── Bid opening ─────────────────────────────────────────────────────────────

export const openBids = async (req, res) => {
  const { witnesses, remarks } = req.body;
  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  if (rfq.status !== "closed") {
    return res.status(409).json({ message: "Close the RFQ/ITB before opening bids." });
  }

  if (new Date() <= new Date(rfq.closingDate)) throw workflowError("Bid opening must occur after the bid submission deadline.");
  if (rfq.openingDate && new Date() < new Date(rfq.openingDate)) throw workflowError("The scheduled bid opening time has not yet been reached.");
  const bids = await Bid.findAll({ where: { rfqId: rfq.id, status: "submitted" }, order: [["submittedAt", "ASC"]] });
  if (bids.length === 0) {
    return res.status(409).json({ message: "No bids were received. Record the official reason and a BAC failed-bidding resolution before initiating a rebid." });
  }

  const record = await withAuditTransaction(async (transaction, audit) => {
    await rfq.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const scheduleIssue = scheduleValidationError(rfq);
    if (scheduleIssue) throw workflowError(scheduleIssue, 400);
    if (new Date() <= new Date(rfq.closingDate) || new Date() < new Date(rfq.openingDate)) throw workflowError("The official submission deadline and bid opening time must be reached before opening bids.");

    if (rfq.status !== "closed") throw workflowError("The procurement status changed. Reload before opening bids.");
    // Assign the anonymous labels used throughout blind evaluation (7.9).
    for (const [index, bid] of bids.entries()) {
      await bid.update(
        { blindLabel: `Bidder ${String.fromCharCode(65 + index)}`, status: "opened" },
        { transaction }
      );
    }

    const created = await BidOpeningRecord.create(
      {
        rfqId: rfq.id,
        openedById: req.currentUser.id,
        openedAt: new Date(),
        witnesses: witnesses ?? null,
        remarks: remarks ?? null,
        bidsReceived: bids.length,
      },
      { transaction }
    );

    await rfq.update({ status: "opened" }, { transaction });
    await audit(actorAudit(req, { actionType: "bidding.opened", entityRef: "rfq", entityId: rfq.id, summary: "Bids opened. The TWG may now begin technical assessment after declaring no conflict of interest.", beforeState: { status: "closed" }, afterState: { status: "opened", openingRecordId: created.id, bidsReceived: bids.length, openedAt: created.openedAt } }));
    return created;
  });

  res.json({
    openingRecordId: record.id,
    bidsReceived: bids.length,
    rfq: serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)),
  });
};

// ── Abstract of Bids / Quotations ───────────────────────────────────────────
// IRR Sec. 34.3(f) for SVP, and the same document by another name for
// competitive bidding: "an Abstract of Quotations or Ratings shall be prepared
// setting forth the names of those who responded... and their corresponding
// price quotations or ratings."
//
// It is also one of the five documents Sec. 43.5 entitles observers to demand,
// and the document they sign as witnesses. It did not exist in this system at
// all, which left observers with nothing to sign and the committee with no
// tabulation of what it received.
export const abstractOfBids = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  const isSmallValue = rfq.mode?.key === "smallValueProcurement";

  // The abstract is prepared after the deadline has passed — before that it
  // would disclose who has bid and at what, while bidding is still open.
  if (["draft", "published"].includes(rfq.status)) {
    return res.status(409).json({
      message: "The Abstract of Bids is prepared after the deadline for submission has closed.",
    });
  }

  const opening = await BidOpeningRecord.findOne({
    where: { rfqId: rfq.id },
    include: [{ model: User, as: "openedBy", attributes: ["id", "name"] }],
  });

  // Keep submitted quotations confidential until the scheduled opening is
  // recorded, then show the respondents and prices required by IRR 34.3(f).
  if (isSmallValue && !svpQuotationsDisclosable(rfq, opening)) {
    return res.status(409).json({ message: "The Abstract of Quotations is available after the scheduled quotation opening is recorded." });
  }

  const bids = await Bid.findAll({
    where: { rfqId: rfq.id },
    include: [{ model: Vendor, as: "vendor" }, { model: Evaluation, as: "evaluations" }],
    order: [["submittedAt", "ASC"]],
  });

  // Competitive bidding keeps its existing blind evaluation disclosure rule.
  const blind = !isSmallValue && isBlindStage(rfq);

  // Observers are invited to each stage separately (pre-bid conference,
  // eligibility checking, preliminary examination, evaluation, post-
  // qualification), so a body that attended all five has five invitation rows.
  // Listing them per row printed the same witness five times on the abstract —
  // a document observers sign. Collapsed to one entry per organisation, naming
  // the stages it actually attended, so nothing is hidden by the deduplication.
  const observerRows = await ObserverInvitation.findAll({
    where: { rfqId: rfq.id, attendance: "attended" },
    include: [{ model: ObserverOrganization, as: "organization" }],
    order: [["scheduledAt", "ASC"]],
  });

  const observers = [];
  const seenOrganizations = new Map();
  for (const row of observerRows) {
    const key = row.observerOrganizationId ?? row.organization?.name ?? Symbol();
    if (seenOrganizations.has(key)) {
      seenOrganizations.get(key).stages.push(row.stage);
      continue;
    }
    const entry = { row, stages: [row.stage] };
    seenOrganizations.set(key, entry);
    observers.push(entry);
  }

  res.json({
    referenceNo: rfq.referenceNo,
    title: rfq.title,
    abc: Number(rfq.abc),
    category: rfq.category,
    mode: rfq.mode?.name ?? null,
    modeKey: rfq.mode?.key ?? null,
    closingDate: rfq.closingDate,
  openingDate: rfq.openingDate,
  qualityWeight: rfq.category === "consulting" ? Number(rfq.qualityWeight) : null,
  financialWeight: rfq.category === "consulting" ? Number(rfq.financialWeight) : null,
  consultingPassingScore: rfq.category === "consulting" ? Number(rfq.consultingPassingScore) : null,
  twgRequired: rfq.twgRequired,
  prHeaderId: rfq.prHeaderId,
  appEntryId: rfq.appEntryId,
    openedAt: opening?.openedAt ?? null,
    openedByName: opening?.openedBy?.name ?? null,
    bidsReceived: bids.length,
    blind,
    entries: bids.map((bid) => ({
      blindLabel: bid.blindLabel,
      bidderName: blind ? bid.blindLabel : (bid.vendor?.businessName ?? null),
      // The SVP abstract records every quotation, including one later found
      // noncompliant. Other modes retain their existing envelope disclosure.
      totalBidPrice: isSmallValue || (!blind && !bid.financialSealed) ? Number(bid.totalBidPrice) : null,
      rating: activeEvaluations(bid.evaluations).length ? Number(technicalAverage(bid.evaluations).toFixed(2)) : null,
      status: bid.status,
      submittedAt: bid.submittedAt,
    })),
    // Sec. 43 — the observers who attended and may sign as witnesses.
    witnesses: observers.map(({ row, stages }) => ({
      organization: row.organization?.name ?? null,
      sector: row.organization?.sector ?? null,
      representative: row.representativeName,
      stagesAttended: stages,
    })),
  });
};

// ── Evaluation (blind) ──────────────────────────────────────────────────────

export const listBidsForRfq = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id, { include: [{ model: ProcurementMode, as: "mode" }] });
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });

  const isSmallValue = rfq.mode?.key === "smallValueProcurement";
  const opening = isSmallValue ? await BidOpeningRecord.findOne({
    where: { rfqId: rfq.id }, attributes: ["id", "openedAt"],
  }) : null;
  const quotationOpened = isSmallValue && svpQuotationsDisclosable(rfq, opening);
  const blind = isSmallValue ? !quotationOpened : isBlindStage(rfq);
  const evaluationPlan = rfq.category === "consulting" ? await EvaluationPlan.findOne({ where: { rfqId: rfq.id } }) : null;
  const bids = await Bid.findAll({
    where: { rfqId: rfq.id },
    include: [
      { model: Vendor, as: "vendor" },
      { model: Evaluation, as: "evaluations" },
      { model: TwgAssessment, as: "twgAssessments", include: [{ model: User, as: "member", attributes: ["id", "name"] }] },
    ],
    order: [["blindLabel", "ASC"]],
  });
  const evidence = quotationOpened && bids.length ? await Document.findAll({
    where: { entityRef: "bid", entityId: { [Op.in]: bids.map((bid) => bid.id) }, docType: { [Op.in]: ["svpTechnicalOffer", "svpEligibilityEvidence"] } },
    attributes: DOCUMENT_METADATA_ATTRIBUTES,
  }) : [];

  res.json({
    blind,
    quotationOpened,
    category: rfq.category,
    evaluationMethod: rfq.category === "consulting" ? "qualityPrice" : "compliance",
    evaluationPlan,
    complianceRequirements: complianceRequirementsFor(rfq.category, rfq.mode?.key),
    qualityWeight: rfq.category === "consulting" ? Number(rfq.qualityWeight) : null,
    financialWeight: rfq.category === "consulting" ? Number(rfq.financialWeight) : null,
    consultingPassingScore: Number(rfq.consultingPassingScore),
    twgRequired: rfq.twgRequired,
    // Say plainly why identities are hidden, so the UI doesn't have to guess.
    blindNotice: quotationOpened
      ? "Small Value Procurement quotations were opened. Respondent names and quoted prices are available while the committee reviews compliance."
      : blind
      ? "Bidder identities are masked until the BAC Chairperson closes evaluation."
      : null,
    bids: bids.map((bid) => ({
      ...serializeBid(bid, {
        blind,
        includeFinancial: isSmallValue ? quotationOpened : !blind || bid.status === "technicalPassed",
        discloseQuotation: quotationOpened,
      }),
      evidence: quotationOpened ? evidence.filter((document) => document.entityId === bid.id).map(({ id, filename, checksum, docType, uploadedAt }) => ({ id, filename, checksum, docType, uploadedAt })) : [],
    })),
  });
};

// ── Two different questions, two different instruments ───────────────────────
// Philippine competitive bidding does NOT score Goods and Infrastructure on a
// weighted rubric. The technical component is examined **pass or fail** against
// the eligibility and technical requirements, and among the bids that pass, the
// **lowest calculated price** wins (RA 12009 Sec. 65 — the LCRB).
//
// A weighted rating belongs only to Consulting Services, where the award goes
// to the Highest Rated Responsive Bid.
//
// This system applied a 0–100 averaged rubric with a hard-coded 60 pass mark to
// everything, which meant a goods procurement could be decided on how generously
// a member scored rather than on price — and could not produce a legally correct
// goods award at all.
export const usesRatedEvaluation = (category) => category === "consulting";

// The minimum rating a consulting proposal must reach to be responsive. The
// Bidding Documents set this per procurement; 60 is the long-standing default
// and is kept here as one named constant rather than a bare number in a
// comparison.
export const CONSULTING_PASSING_SCORE = 60;

export { submitEvaluation, closeEvaluation } from "./evaluationController.js";

export const submitPostQualification = async (req, res) => {
  const { result, remarks, checklist } = req.body;
  const bid = await Bid.findByPk(req.params.bidId, { include: [{ model: Rfq, as: "rfq" }] });
  if (!bid) return res.status(404).json({ message: "Bid not found." });

  if (bid.rfq.status !== "evaluated") {
    return res.status(409).json({ message: "Close evaluation before post-qualification." });
  }
  if (bid.status !== "technicalPassed") {
    return res.status(409).json({ message: "Only a bid that passed the technical component can be post-qualified." });
  }
  if (!["passed", "failed"].includes(result)) {
    return res.status(400).json({ message: "Result must be passed or failed." });
  }
  if (result === "failed" && !remarks?.trim()) {
    return res.status(400).json({ message: "Remarks are required when a bidder fails post-qualification." });
  }

  await withAuditTransaction(async (transaction, audit) => {
    const currentRfq = await Rfq.findByPk(bid.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    const mode = await ProcurementMode.findByPk(currentRfq.procurementModeId, { transaction });
    await bid.reload({ transaction });
    await assertNoPendingFailure(currentRfq, { transaction });
    if (currentRfq.status !== "evaluated" || bid.status !== "technicalPassed") throw workflowError("The bid status changed. Reload before recording post-qualification.");
    if (mode?.key === "smallValueProcurement" && result === "passed") {
      const evidence = await Document.findAll({ where: { entityRef: "bid", entityId: bid.id, docType: { [Op.in]: ["svpTechnicalOffer", "svpEligibilityEvidence"] } }, attributes: ["docType"], transaction });
      if (!["svpTechnicalOffer", "svpEligibilityEvidence"].every((type) => evidence.some((document) => document.docType === type))) throw workflowError("Review the submitted technical offer and eligibility evidence before recording a compliant supplier verification.");
      if (!["legal", "technical", "financial"].every((key) => checklist?.[key] === "ok") || !remarks?.trim()) throw workflowError("Record compliant legal, technical and financial findings with written justification before passing supplier verification.", 400);
    }
    const candidates = await Bid.findAll({ where: { rfqId: bid.rfqId }, include: [{ model: Evaluation, as: "evaluations" }], transaction });
    if (candidates.some((candidate) => candidate.evaluations.some((row) => row.status === "returned"))) throw workflowError("Complete returned evaluations before post-qualification.");
    const entitled = rankBids(candidates, currentRfq.category).ranked[0];
    if (entitled?.id !== bid.id) throw workflowError("Post-qualify the highest-ranked responsive bidder first. Proceed to the next bidder only after a failed post-qualification.");
    await PostQualification.create(
      {
        bidId: bid.id,
        verifiedById: req.currentUser.id,
        checklist: checklist ?? null,
        result,
        remarks: remarks ?? null,
        verifiedAt: new Date(),
      },
      { transaction }
    );
    await bid.update({ status: result === "passed" ? "postQualified" : "postDisqualified" }, { transaction });
    const attempt = await ensureProcurementAttempt(currentRfq, { transaction, actorId: req.currentUser.id });
    await audit(actorAudit(req, { actionType: "evaluation.postQualification", entityRef: "bid", entityId: bid.id, summary: result === "passed" ? "Post-qualification passed. The BAC may recommend award." : "Post-qualification failed. Review the next ranked responsive bidder.", beforeState: { status: "technicalPassed" }, afterState: { rfqId: bid.rfqId, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, vendorId: bid.vendorId, status: bid.status, result, remarks, checklist } }));
  });

  res.status(201).json({ bidId: bid.id, result, message: result === "passed" ? "Post-qualification passed. The BAC may now recommend award." : "Post-qualification failed. Proceed to the next ranked responsive bidder." });
};

// ── Award ───────────────────────────────────────────────────────────────────

// ── Who is actually entitled to the award ────────────────────────────────────
// RA 12009 Sec. 65 gives the contract to the Lowest Calculated Responsive Bid
// for Goods and Infrastructure Projects, and to the Highest Rated Responsive
// Bid for Consulting Services. It is not the committee's to choose among the
// bidders who passed.
//
// This was previously unchecked: `recommendAward` accepted any post-qualified
// bid, while the resolution it generated asserted the bid "was found the Lowest
// Calculated Responsive Bid". The system would produce a signed committee
// resolution stating a fact nobody had verified — and it would have said the
// same thing about the most expensive offer on the table.
//
// Bids that failed the technical component or were post-disqualified drop out
// of the ranking, which is what lets the award move down the list when the
// lowest bidder fails post-qualification. That is the real procedure: bidders
// are post-qualified in order, and the next in line is taken up on failure.
const rankBids = (bids, category) => {
  const contenders = bids.filter((bid) =>
    ["technicalPassed", "postQualified"].includes(bid.status)
  );

  if (category === "consulting") {
    // HRRB — highest rated responsive bid.
    return {
      basis: "HRRB",
      basisLabel: "Highest Rated Responsive Bid",
      ranked: [...contenders].sort((a, b) => (Number(b.combinedScore ?? averageScore(b)) - Number(a.combinedScore ?? averageScore(a))) || Number(a.totalBidPrice) - Number(b.totalBidPrice) || a.id - b.id),
    };
  }

  // LCRB — lowest calculated responsive bid.
  return {
    basis: "LCRB",
    basisLabel: "Lowest Calculated Responsive Bid",
    ranked: [...contenders].sort((a, b) => Number(a.totalBidPrice) - Number(b.totalBidPrice)),
  };
};

const averageScore = (bid) => {
  const evaluations = (bid.evaluations ?? []).filter((row) => !row.status || row.status === "submitted");
  if (evaluations.length === 0) return 0;
  return evaluations.reduce((sum, e) => sum + Number(e.score), 0) / evaluations.length;
};

const assertAwardTechnicalReview = async (bid, rfq, { transaction } = {}) => {
  const fresh = await Bid.findByPk(bid.id, { transaction });
  if (fresh.status !== "postQualified" || fresh.financialSealed) throw workflowError("Only a technically compliant, post-qualified bidder may be awarded.");
  const evaluations = await Evaluation.findAll({ where: { bidId: bid.id }, transaction });
  if (evaluations.some((row) => row.status === "returned")) throw workflowError("Complete returned evaluations before an award decision.");
  if (rfq.twgRequired && !evaluations.some((row) => (!row.status || row.status === "submitted") && row.noConflictDeclared)) throw workflowError("Complete the required BAC evaluation and conflict-of-interest declaration before an award decision.");
  if (rfq.category === "consulting" && fresh.combinedScore == null) throw workflowError("Complete quality and financial scoring before an award decision.");
  if (!rfq.twgRequired) return;
  const assessments = await TwgAssessment.findAll({ where: { bidId: bid.id, excludedForConflict: false }, transaction });
  if (!assessments.length || assessments.some((row) => !assessmentCompliant(row))) throw workflowError("The required TWG technical assessment must be submitted and compliant before an award decision.");
};

export const recommendAward = async (req, res) => {
  const bid = await Bid.findByPk(req.params.bidId, {
    include: [
      { model: Rfq, as: "rfq", include: [{ model: ProcurementMode, as: "mode" }] },
      { model: Vendor, as: "vendor" },
    ],
  });
  if (!bid) return res.status(404).json({ message: "Bid not found." });

  if (bid.status !== "postQualified") {
    return res.status(409).json({ message: "Only a post-qualified bid can be recommended for award." });
  }
  if (await Award.findOne({ where: { rfqId: bid.rfqId, status: { [Op.notIn]: ["cancelled", "disapproved"] } } })) {
    return res.status(409).json({ message: "This procurement already has an award." });
  }

  // Eligibility is re-checked here, not assumed from bid submission. Weeks pass
  // between bidding and award, and a supplier can be blacklisted or let their
  // PhilGEPS registration lapse in that window. Awarding to an ineligible
  // supplier is the failure this catches.
  const eligibility = checkVendorEligibility(bid.vendor);
  if (!eligibility.eligible) {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.PERMISSION_DENIED,
      entityRef: "bid",
      entityId: bid.id,
      outcome: "denied",
      summary: `Award recommendation blocked — ${bid.vendor?.businessName}: ${eligibility.code}`,
    });
    return res.status(409).json({
      message: `This bidder is no longer eligible. ${eligibility.reason}`,
      code: eligibility.code,
    });
  }

  // ── The mode decides how many offers make a valid contest ──────────────────
  // Small Value Procurement requests quotations from at least three qualified
  // suppliers, but one received quotation may proceed to evaluation (IRR Sec.
  // 34.1 and 34.3(c)). The stored mode value may predate this correction.
  const mode = bid.rfq?.mode;
  const minimumOffers = mode?.key === "smallValueProcurement" ? 1 : (mode?.minimumOffers ?? 2);
  const offersReceived = await Bid.count({
    where: { rfqId: bid.rfqId, status: { [Op.ne]: "withdrawn" } },
  });

  if (offersReceived < minimumOffers) {
    return res.status(409).json({
      message:
        `${mode?.name ?? "This mode"} requires at least ${minimumOffers} offer(s) before an award may be ` +
        `recommended; ${offersReceived} received. Declare a failure of bidding instead.`,
      minimumOffers,
      offersReceived,
    });
  }

  // ── The bid must be the one the law entitles to the award ──────────────────
  const contenders = await Bid.findAll({
    where: { rfqId: bid.rfqId },
    include: [{ model: Evaluation, as: "evaluations" }, { model: Vendor, as: "vendor" }],
  });

  const { basis, basisLabel, ranked } = rankBids(contenders, bid.rfq?.category);
  const entitled = ranked[0];

  if (!entitled) {
    return res.status(409).json({
      message: "No bid remains eligible for award. Declare a failure of bidding.",
    });
  }

  if (entitled.id !== bid.id) {
    return res.status(409).json({
      message:
        `This is not the ${basisLabel}. ${entitled.vendor?.businessName ?? entitled.blindLabel} ` +
        (basis === "LCRB"
          ? `bid ₱${Number(entitled.totalBidPrice).toLocaleString()} against this bidder's ` +
            `₱${Number(bid.totalBidPrice).toLocaleString()}. `
          : `scored ${Number(entitled.combinedScore ?? averageScore(entitled)).toFixed(2)} against this bidder's ` +
            `${Number(bid.combinedScore ?? averageScore(bid)).toFixed(2)}. `) +
        `Post-qualify and resolve that bid first; the award moves down the ranking only when the ` +
        `bidder ahead fails post-qualification (RA 12009 Sec. 65).`,
      basis,
      entitled: {
        blindLabel: entitled.blindLabel,
        vendorName: entitled.vendor?.businessName ?? null,
        totalBidPrice: Number(entitled.totalBidPrice),
        status: entitled.status,
      },
    });
  }

  // ── Sec. 84: "Protests must first be resolved before any award is made" ────
  // An award made over a live protest is void of the process the law requires,
  // and under Sec. 85 a bidder cannot even go to court until the mechanism has
  // run — so proceeding here would strand them.
  const pendingProtests = await unresolvedProtestsFor(bid.rfqId);
  if (pendingProtests.length > 0) {
    return res.status(409).json({
      message:
        `${pendingProtests.length} protest(s) or request(s) for reconsideration are unresolved on this ` +
        `procurement. Protests must first be resolved before any award is made (RA 12009 Sec. 84).`,
      protests: pendingProtests.map((protest) => ({
        id: protest.id,
        stage: protest.stage,
        vendorName: protest.vendor?.businessName ?? null,
        dueAt: protest.dueAt,
      })),
    });
  }

  // ── The committee must be quorate before it can resolve anything ───────────
  // Checked before the award record is written, so a committee that cannot
  // lawfully sit does not leave a dangling Notice of Award behind it.
  const { award, resolution } = await withSequenceRetry(() => withAuditTransaction(async (transaction, audit) => {
    const locked = await Rfq.findByPk(bid.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    await assertNoPendingFailure(locked, { transaction });
    if (locked.status !== "evaluated") throw workflowError("Complete BAC evaluation before recommending an award.");
    if (await Award.findOne({ where: { rfqId: bid.rfqId, status: { [Op.notIn]: ["cancelled", "disapproved"] } }, transaction })) throw workflowError("This procurement already has an award recommendation.");
    await assertAwardTechnicalReview(bid, locked, { transaction });
    const currentBids = await Bid.findAll({ where: { rfqId: locked.id }, include: [{ model: Evaluation, as: "evaluations" }], transaction });
    if (currentBids.some((candidate) => candidate.evaluations.some((row) => row.status === "returned"))) throw workflowError("Complete returned evaluations before recommending an award.");
    if (rankBids(currentBids, locked.category).ranked[0]?.id !== bid.id) throw workflowError("The responsive bid ranking changed. Review the current ranking before recommending award.");
    const context = await assertBacAction(req, { transaction });
    const year = new Date().getFullYear();
    const award = await Award.create({
      noaNumber: await nextSequenceNo(Award, "noaNumber", "NOA", year, { transaction }),
      noaDate: new Date().toISOString().slice(0, 10), amount: bid.totalBidPrice,
      rfqId: bid.rfqId, bidId: bid.id, vendorId: bid.vendorId,
      recommendedById: req.currentUser.id, status: "pendingHopeApproval", awardBasis: basis,
    }, { transaction });
    const resolution = await BacResolution.create({
      resolutionNo: req.body.resolutionNo || await nextResolutionNo(year, transaction),
      type: "recommendAward", title: `Resolution recommending award of ${bid.rfq.referenceNo}`,
      recitals: req.body.remarks?.trim() || `${offersReceived} offers received; ${ranked.length} responsive bids. The recommended bidder ranked first as the ${basisLabel} (${basis}) and passed post-qualification.`,
      resolvedAt: new Date(), members: committeeSnapshot(context), quorumMet: true,
      chairpersonId: context.presidingId, entityRef: "award", entityId: award.id,
    }, { transaction });
    const attempt = await ensureProcurementAttempt(locked, { transaction, actorId: req.currentUser.id });
    await attempt.update({ bacResolutionId: resolution.id, nextAction: "Notice of Award approval/signature", outcomeSnapshot: await snapshotAttemptOutcome(locked, { transaction }) }, { transaction });
    await audit(actorAudit(req, { actionType: AUDIT_ACTIONS.AWARD_RECOMMENDED, entityRef: "award", entityId: award.id, summary: `${resolution.resolutionNo}: BAC award recommendation submitted for HoPE approval.`, afterState: { rfqId: locked.id, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, resolutionNo: resolution.resolutionNo, status: "pendingHopeApproval", members: resolution.members, amount: Number(award.amount) } }));
    await audit(actorAudit(req, { actionType: "award.noticeCreated", entityRef: "award", entityId: award.id, summary: "Notice of Award prepared for approval.", afterState: { rfqId: locked.id, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, bidId: bid.id, vendorId: bid.vendorId, noaNumber: award.noaNumber, status: award.status } }));
    return { award, resolution };
  }));

  await notifyByPermission("bidding.award", {
    type: NOTIFICATION_EVENTS.AWARD_RECOMMENDED,
    title: `Award awaiting your approval — ${award.noaNumber}`,
    body: `${bid.vendor?.businessName ?? "A bidder"} recommended for ₱${Number(award.amount).toLocaleString()}.`,
    link: "/evaluation",
    refEntity: "award",
    refId: award.id,
    severity: "warning",
  });

  res.status(201).json({
    id: award.id,
    noaNumber: award.noaNumber,
    amount: Number(award.amount),
    status: award.status,
    vendorName: bid.vendor?.businessName ?? null,
    resolution: {
      resolutionNo: resolution.resolutionNo,
      quorumMet: resolution.quorumMet,
      memberCount: resolution.members?.length ?? 0,
    },
    offersReceived,
  });
};

// Section 2.3: the HOPE approves the award.
export const approveAward = async (req, res) => {
  const award = await Award.findByPk(req.params.id, {
    include: [
      { model: Bid, as: "bid" },
      { model: Rfq, as: "rfq", include: [{ model: AppEntry, as: "appEntry" }] },
    ],
  });
  if (!award) return res.status(404).json({ message: "Award not found." });
  if (award.status !== "pendingHopeApproval") {
    return res.status(409).json({ message: `Cannot approve from status "${award.status}".` });
  }
  if (award.recommendedById === req.currentUser.id) throw workflowError("You cannot approve your own award recommendation. Another authorized approving officer must review it.", 403);

  // ── The line an Early Procurement Activity may not cross ───────────────────
  // EPA lets everything happen before the ordinance except this. RA 12009 and
  // the 2016 IRR before it are both explicit that no award of contract may be
  // made until the appropriation ordinance has been enacted — the LGU would be
  // committing money the Sanggunian has not granted.
  if (award.rfq?.isEarlyProcurement) {
    const planLine = award.rfq.appEntry;
    const finalised =
      planLine &&
      (planLine.planCycle === "final" ||
        (await AppEntry.findOne({
          where: { indicativeOriginId: planLine.id, planCycle: "final", status: { [Op.in]: ["approved", "locked"] } },
        })));

    if (!finalised) {
      return res.status(409).json({
        message:
          "This is an Early Procurement Activity. Procurement may proceed short of award, but no " +
          "contract may be awarded until the appropriation ordinance is enacted and the plan line is " +
          "finalised against it (RA 12009; IRR Sec. 7.7.5).",
        earlyProcurement: true,
      });
    }
  }

  // An ordinary requisition can also be raised against next year's FINAL APP
  // after its annual ordinance is enacted in the current year. Enactment does
  // not make that annual budget effective early: LGC Sec. 320 starts it on the
  // first day of the ensuing calendar year. Keep the BAC recommendation pending
  // until the fiscal-year funding behind the requisition is actually effective.
  if (award.rfq?.prHeaderId) {
    const pr = await PrHeader.findByPk(award.rfq.prHeaderId, {
      include: [{ model: AppEntry, as: "appEntry" }],
    });
    const appEntry = pr?.appEntry;
    const appropriation = appEntry?.appropriationId
      ? await Appropriation.findByPk(appEntry.appropriationId)
      : null;
    const appYear = Number(appEntry?.fiscalYear);
    const appropriationYear = Number(appropriation?.fiscalYear);
    const localYear = Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila", year: "numeric",
    }).format(new Date()));
    if (appEntry && appropriation && appYear !== appropriationYear) {
      return res.status(409).json({
        code: "AWARD_FUNDING_YEAR_MISMATCH",
        message: `The final APP is for FY ${appYear}, but its appropriation is for FY ${appropriationYear}. Correct the funding lineage before approving this award.`,
      });
    }
    if (appYear > localYear || appropriationYear > localYear) {
      if (appEntry?.planCycle !== "final" || appEntry.planStage !== "finalApp" ||
          !["approved", "locked"].includes(appEntry.status) ||
          !appropriation || appropriation.status !== "enacted" || appYear !== appropriationYear) {
        return res.status(409).json({
          code: "AWARD_FUNDING_NOT_FINAL",
          message: "The next-year award must wait for a matching approved final APP and enacted appropriation.",
        });
      }
      if (appropriation.type !== "annual") {
        return res.status(409).json({
          code: "AWARD_FUNDING_EFFECTIVITY_UNVERIFIED",
          fundingFiscalYear: appYear,
          message: `The linked appropriation is recorded for FY ${appYear}, which has not begun. Its effectivity must be established before the HoPE may issue the Notice of Award.`,
        });
      }
      return res.status(409).json({
        code: "AWARD_FUNDING_NOT_EFFECTIVE",
        fundingFiscalYear: appYear,
        effectiveOn: `${appYear}-01-01`,
        message: `The FY ${appYear} annual funding does not take effect until January 1, ${appYear}. Keep the BAC recommendation pending; the HoPE cannot issue the Notice of Award yet.`,
      });
    }
  }

  // Sec. 84 — re-checked at approval, not only at recommendation: a protest can
  // be filed in the window between the committee resolving and the Mayor
  // signing, and that is exactly when a losing bidder files one.
  const pendingProtests = await unresolvedProtestsFor(award.rfqId);
  if (pendingProtests.length > 0) {
    return res.status(409).json({
      message:
        `${pendingProtests.length} protest(s) remain unresolved on this procurement. Protests must ` +
        `first be resolved before any award is made (RA 12009 Sec. 84).`,
    });
  }

  await withAuditTransaction(async (transaction, audit) => {
    const lockedRfq = await Rfq.findByPk(award.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    await award.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (award.status !== "pendingHopeApproval" || lockedRfq.status !== "evaluated") throw workflowError("The procurement or award status changed. Reload before approving.");
    await assertAwardTechnicalReview({ id: award.bidId }, lockedRfq, { transaction });
    await award.update({ status: "issued", approvedById: req.currentUser.id }, { transaction });
    await Bid.update({ status: "awarded" }, { where: { id: award.bidId }, transaction });
    await Bid.update({ status: "lost" }, { where: { rfqId: award.rfqId, id: { [Op.ne]: award.bidId }, status: { [Op.notIn]: ["withdrawn", "technicalFailed", "postDisqualified"] } }, transaction });
    await lockedRfq.update({ status: "awarded" }, { transaction });
    const attempt = await ensureProcurementAttempt(lockedRfq, { transaction, actorId: req.currentUser.id });
    await attempt.update({ status: "successful", completedAt: new Date(), nextAction: "Contract preparation", outcomeSnapshot: await snapshotAttemptOutcome(lockedRfq, { transaction }) }, { transaction });
    await audit(actorAudit(req, { actionType: AUDIT_ACTIONS.AWARD_APPROVED, entityRef: "award", entityId: award.id, summary: `${award.noaNumber} approved. Proceed to contract preparation.`, beforeState: { status: "pendingHopeApproval" }, afterState: { status: "issued", rfqId: award.rfqId, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, approvedById: req.currentUser.id } }));
    await audit(actorAudit(req, { actionType: "award.noticeIssued", entityRef: "award", entityId: award.id, summary: "Approved Notice of Award issued.", afterState: { rfqId: award.rfqId, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, bidId: award.bidId, vendorId: award.vendorId, noaNumber: award.noaNumber, status: "issued" } }));
  });

  // Section 7.4: award issuance notifies the winner, and the others are told
  // the outcome rather than left waiting.
  const allBids = await Bid.findAll({
    where: { rfqId: award.rfqId },
    include: [{ model: Vendor, as: "vendor" }],
  });
  for (const bid of allBids) {
    const won = bid.id === award.bidId;
    await notifyUsers([bid.vendor?.userId], {
      type: NOTIFICATION_EVENTS.AWARD_ISSUED,
      title: won ? `Notice of Award — ${award.noaNumber}` : `Award decided — ${award.rfq?.referenceNo ?? ""}`,
      body: won
        ? `You have been awarded this contract for ₱${Number(award.amount).toLocaleString()}.`
        : "This procurement has been awarded to another bidder.",
      link: "/supplier/opportunities",
      refEntity: "award",
      refId: award.id,
      severity: won ? "success" : "info",
    });
  }

  res.json({ id: award.id, noaNumber: award.noaNumber, status: "issued" });
};

// ── Failure of bidding, and the road to Negotiated Procurement ───────────────
// RA 12009 Sec. 64. A bidding fails when no bids are received, no bid qualifies,
// or the bidder with the LCRB/HRRB fails post-qualification. After the SECOND
// failure the Procuring Entity may resort to Negotiated Procurement under
// Sec. 35.1 — which is why the count of failures has to be a fact on the record
// rather than something reconstructed from cancelled solicitations.
export { declareFailureOfBidding } from "./procurementGovernanceController.js";

export const disapproveAward = async (req, res) => {
  const { grounds } = req.body ?? {};
  const award = await Award.findByPk(req.params.id, {
    include: [{ model: Rfq, as: "rfq" }, { model: Vendor, as: "vendor" }],
  });
  if (!award) return res.status(404).json({ message: "Award not found." });
  if (award.recommendedById === req.currentUser.id) throw workflowError("Another authorized approving officer must review your award recommendation.", 403);
  if (award.status !== "pendingHopeApproval") {
    return res.status(409).json({ message: `Cannot disapprove from status "${award.status}".` });
  }

  // The grounds are the whole substance of the act — a disapproval without them
  // is exactly what Sec. 66 forbids.
  if (!grounds?.trim() || grounds.trim().length < 30) {
    return res.status(400).json({
      message:
        "A disapproval must state valid, reasonable and justifiable grounds in writing, furnished to " +
        "the BAC (RA 12009 Sec. 66). Record them here in at least 30 characters.",
    });
  }

  await withAuditTransaction(async (transaction, audit) => {
    await Rfq.findByPk(award.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    await award.reload({ transaction, lock: transaction.LOCK.UPDATE });
    if (award.status !== "pendingHopeApproval") throw workflowError("This award recommendation has already been decided. Refresh the award queue.");
    await award.update(
      { status: "disapproved", disapprovalGrounds: grounds.trim(), disapprovedAt: new Date() },
      { transaction }
    );
    // The solicitation goes back to the committee, not to the winner.
    await Rfq.update({ status: "evaluated" }, { where: { id: award.rfqId }, transaction });
    await audit(actorAudit(req, {
    actionType: AUDIT_ACTIONS.AWARD_APPROVED,
    outcome: "denied",
    entityRef: "award",
    entityId: award.id,
    summary: `${award.noaNumber} disapproved by the Head of the Procuring Entity`,
    beforeState: { status: "pendingHopeApproval" },
    afterState: { status: "disapproved", grounds: grounds.trim() },
    }));
  });

  // Sec. 66 requires the grounds to be furnished to the BAC.
  await notifyByPermission("bidding.chairEvaluation", {
    type: NOTIFICATION_EVENTS.AWARD_RECOMMENDED,
    title: `${award.noaNumber} disapproved`,
    body: grounds.trim(),
    link: "/evaluation",
    refEntity: "award",
    refId: award.id,
    severity: "danger",
  });

  res.json({ id: award.id, status: "disapproved", grounds: grounds.trim() });
};

export const listAwards = async (req, res) => {
  const where = req.permissions.has("bidding.view")
    ? {}
    : { status: { [Op.in]: ["issued", "accepted"] } };
  // A public-view-only caller remains limited to issued/accepted records even
  // if they put a different status in the query string.
  if (req.query.status && req.permissions.has("bidding.view")) where.status = req.query.status;
  const search = searchCondition(req.query.search, [
    "noaNumber",
    "status",
    "$rfq.referenceNo$",
    "$rfq.title$",
    "$vendor.businessName$",
  ]);
  if (search) where[Op.and] = [search];
  const include = [
    { model: Rfq, as: "rfq" },
    { model: Vendor, as: "vendor" },
    { model: User, as: "recommendedBy", attributes: ["id", "name"] },
  ];
  const serializeAward = (award) => ({
    id: award.id,
    noaNumber: award.noaNumber,
    noaDate: award.noaDate,
    amount: Number(award.amount),
    status: award.status,
    referenceNo: award.rfq?.referenceNo ?? null,
    projectTitle: award.rfq?.title ?? null,
    vendorName: award.vendor?.businessName ?? null,
    recommendedByName: award.recommendedBy?.name ?? null,
    recommendedById: award.recommendedById,
  });

  // Keep the original array response for selection dialogs and other callers
  // that predate the list protocol; the award workspace opts in explicitly.
  const wantsPaging = Object.hasOwn(req.query, "page") || Object.hasOwn(req.query, "pageSize");
  if (!wantsPaging) {
    const awards = await Award.findAll({ where, include, order: [["createdAt", "DESC"]] });
    return res.json(awards.map(serializeAward));
  }

  const paging = parseListParams(req.query, {
    sorts: {
      noaNumber: "noaNumber",
      noaDate: "noaDate",
      amount: "amount",
      status: "status",
      createdAt: "createdAt",
    },
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const { rows, count } = await Award.findAndCountAll({
    where,
    include,
    order: paging.order,
    limit: paging.limit,
    offset: paging.offset,
    distinct: true,
    subQuery: false,
  });
  return res.json(pageEnvelope({
    rows: rows.map(serializeAward),
    total: count,
    page: paging.page,
    pageSize: paging.pageSize,
  }));
};
