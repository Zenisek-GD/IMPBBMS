import { Op } from "sequelize";
import { Rfq, Bid, Award } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { ProcurementAttempt, NegotiatedReview } from "../models/procurementAttemptModel.js";
import { BacResolution } from "../models/bacResolutionModel.js";
import { getLguProfile, getProcurementPolicy } from "../models/systemSettingModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { normalizeResolutionNumber } from "../services/resolutionNumber.js";
import { nextSequenceNo } from "../services/sequenceNo.js";
import { negotiatedEligibility, failureStatusLabel, validateAttemptSchedule } from "../services/attemptPolicy.js";
import { getBacContext, assertBacAction, committeeSnapshot, ensureProcurementAttempt,
  attemptsForProject, assertNegotiatedEligibility, findNegotiatedReview, lockProcurementProject,
  normalizeSupportingDocuments, snapshotAttemptOutcome } from "../services/procurementGovernance.js";
import { procurementAmountError, requiresPrebidConference, postingExemptionFor } from "../services/procurementThresholds.js";

const rfqFor = async (id, transaction) => {
  const rfq = await Rfq.findByPk(id, { transaction });
  if (!rfq) throw workflowError("Procurement attempt not found.", 404);
  await lockProcurementProject(rfq, transaction);
  if (transaction) await rfq.reload({ transaction, lock: transaction.LOCK.UPDATE });
  return rfq;
};

const trimmed = (value) => typeof value === "string" ? value.trim() : "";
const resolutionInput = (body = {}) => {
  const resolutionNo = normalizeResolutionNumber(trimmed(body.resolutionNo));
  const resolvedAt = new Date(body.resolutionDate);
  if (!resolutionNo || resolutionNo.length > 255) throw workflowError("Enter the actual BAC resolution number without the Resolution No. prefix.", 400);
  if (!body.resolutionDate || !Number.isFinite(resolvedAt.getTime()) || resolvedAt > new Date(Date.now() + 86400000)) throw workflowError("Enter a valid resolution date that is not in the future.", 400);
  return { resolutionNo, resolvedAt };
};

const createResolution = (req, rfq, bac, type, recitals, transaction) => BacResolution.create({
  ...resolutionInput(req.body), type, title: `${type === "failureOfBidding" ? "Failure of bidding" : "Negotiated procurement decision"}: ${rfq.referenceNo}`,
  recitals, members: committeeSnapshot(bac), quorumMet: true, chairpersonId: bac.presidingId,
  entityRef: "rfq", entityId: rfq.id,
}, { transaction });

const serializeReview = (review) => review ? { id: review.id, status: review.status, reviewerId: review.reviewerId, approverId: review.approverId,
  justification: review.justification, legalBasis: review.legalBasis, decisionRemarks: review.decisionRemarks, reviewedAt: review.reviewedAt,
  approvedAt: review.approvedAt, bacResolutionId: review.bacResolutionId, resultingRfqId: review.resultingRfqId, supportingDocuments: review.supportingDocuments } : null;

export const getBacCommittee = async (req, res) => {
  const { committee, policy, quorum } = await getBacContext(req);
  res.json({ committee, policy, quorum });
};

export const listAttemptHistory = async (req, res) => {
  const rfq = await rfqFor(req.params.id);
  // Registry backfill is migration-owned; reads never invent official evidence.
  const attempts = await attemptsForProject(rfq);
  const policy = await getProcurementPolicy();
  const latest = attempts.at(-1);
  const review = latest ? await findNegotiatedReview(latest) : null;
  const rows = [];
  for (const attempt of attempts) {
    const record = attempt.rfq;
    const snapshot = attempt.status === "ongoing" ? { ...(attempt.outcomeSnapshot ?? {}), ...await snapshotAttemptOutcome(record) } : attempt.outcomeSnapshot ?? {};
    const disclosed = ["evaluated", "awarded"].includes(record?.status) || snapshot.wasDisclosed === true;
    const bids = await Bid.findAll({ where: { rfqId: attempt.rfqId }, attributes: ["id", "vendorId", "blindLabel", "status"] });
    rows.push({ id: attempt.id, rfqId: attempt.rfqId, attemptNumber: attempt.attemptNumber,
      status: record?.status === "awarded" ? "successful" : record?.status === "cancelled" ? "cancelled" : attempt.status,
      statusLabel: attempt.status === "failed" ? failureStatusLabel(attempt.attemptNumber) : record?.status ?? attempt.status,
      referenceNo: record?.referenceNo, title: record?.title, category: record?.category, method: record?.mode?.name, modeKey: record?.mode?.key,
      startedAt: attempt.startedAt, closingDate: record?.closingDate, openingDate: record?.openingDate, completedAt: attempt.completedAt,
      failureReason: attempt.failureReason, nextAction: attempt.nextAction, responsibleUser: attempt.responsibleUser,
      participatingBidders: bids.map((bid) => ({ bidId: bid.id, vendorId: disclosed ? bid.vendorId : null, name: (disclosed ? snapshot.participatingBidders?.find((row) => row.bidId === bid.id)?.vendorName : null) || bid.blindLabel || `Bid #${bid.id}`, status: bid.status })),
      evaluationResult: disclosed ? snapshot.evaluationResult ?? [] : (snapshot.evaluationResult ?? []).map((row) => ({ bidId: row.bidId, status: row.status })),
      twgRecommendations: disclosed ? snapshot.twgRecommendations ?? [] : (snapshot.twgRecommendations ?? []).map((row) => ({ bidId: row.bidId, recommendation: row.recommendation, submittedAt: row.submittedAt })),
      resolution: attempt.resolution ? { id: attempt.resolution.id, resolutionNo: normalizeResolutionNumber(attempt.resolution.resolutionNo), resolvedAt: attempt.resolution.resolvedAt, quorumMet: attempt.resolution.quorumMet, members: attempt.resolution.members } : null,
      bacDecision: snapshot.bacDecision ?? (record?.status === "awarded" ? "Award approved" : attempt.resolution?.type === "recommendAward" ? "Recommended for award" : record?.status === "evaluated" ? "Evaluation completed" : null), supportingDocuments: attempt.supportingDocuments,
    });
  }
  res.json({ attempts: rows, eligibility: negotiatedEligibility(attempts, policy), negotiatedReview: serializeReview(review), policy });
};

export const declareFailureOfBidding = async (req, res) => {
  const reason = trimmed(req.body?.reason);
  if (!reason) throw workflowError("Record the official reason for declaring this procurement attempt failed.", 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    if (!["closed", "opened", "evaluated"].includes(rfq.status)) throw workflowError(`A failure cannot be declared while this attempt is ${rfq.status}. Close submissions and complete the applicable evaluation first.`);
    const pendingAward = await Award.findOne({ where: { rfqId: rfq.id, status: { [Op.in]: ["pendingHopeApproval", "issued", "accepted"] } }, transaction });
    if (pendingAward) throw workflowError("Resolve the existing award recommendation before declaring this procurement failed.");
    const bidCount = await Bid.count({ where: { rfqId: rfq.id, status: { [Op.ne]: "withdrawn" } }, transaction });
    if (rfq.status === "closed" && bidCount) throw workflowError("Open the received bids and complete evaluation before declaring this attempt failed.");
    if (bidCount && rfq.twgRequired && rfq.status !== "evaluated") throw workflowError("Complete TWG technical evaluation and the BAC evaluation decision before declaring this attempt failed.");
    const bac = await assertBacAction(req, { transaction });
    const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
    const supportingDocuments = await normalizeSupportingDocuments(req.body?.supportingDocuments, rfq, { transaction });
    if (bac.policy.requireFailureDocuments && !supportingDocuments.length) throw workflowError("Attach the official supporting records for this failed procurement attempt.", 400);
    const resolution = await createResolution(req, rfq, bac, "failureOfBidding", reason, transaction);
    const beforeState = { status: rfq.status, attemptNumber: attempt.attemptNumber };
    const outcomeSnapshot = await snapshotAttemptOutcome(rfq, { transaction });
    const numberFailed = await ProcurementAttempt.count({ where: { projectKey: attempt.projectKey, status: "failed" }, transaction }) + 1;
    const nextAction = numberFailed >= bac.policy.requiredFailedAttempts ? "Negotiated Procurement Eligibility Review" : "Rebid";
    await attempt.update({ status: "failed", failureReason: reason, bacResolutionId: resolution.id, supportingDocuments, completedAt: new Date(),
      nextAction, responsibleUserId: req.currentUser.id, outcomeSnapshot: { ...outcomeSnapshot, bacDecision: "Failed", resolution: resolution.get({ plain: true }), quorum: bac.quorum } }, { transaction });
    await rfq.update({ status: "failed", cancellationReason: reason }, { transaction });
    // Preserve submitted bid and evaluation statuses as evidence of the outcome.
    await audit(actorAudit(req, { actionType: "bidding.failed", entityRef: "rfq", entityId: rfq.id,
      summary: `${rfq.referenceNo}: attempt #${attempt.attemptNumber} declared failed`, beforeState,
      afterState: { status: "failed", projectKey: attempt.projectKey, attemptNumber: attempt.attemptNumber, reason, resolutionNo: resolution.resolutionNo, bacMembers: committeeSnapshot(bac), nextAction, supportingDocuments } }));
    return { id: rfq.id, status: "failed", statusLabel: failureStatusLabel(attempt.attemptNumber), failureNumber: attempt.attemptNumber,
      mayNegotiate: false, eligibleForReview: numberFailed >= bac.policy.requiredFailedAttempts,
      message: numberFailed >= bac.policy.requiredFailedAttempts
        ? "The required bidding attempts have been declared failed. The procurement is now eligible for Negotiated Procurement review, subject to BAC approval."
        : numberFailed === 1 ? "First bidding attempt has been declared failed. A rebid may now be initiated." : `Procurement attempt #${attempt.attemptNumber} has been declared failed. A rebid may now be initiated; ${bac.policy.requiredFailedAttempts} failed attempts are required before negotiated review.`, nextAction };
  });
  res.json(result);
};

const latestFailedAttempt = async (rfq, transaction) => {
  if (rfq.status !== "failed") throw workflowError("This action requires a failed procurement attempt.");
  const attempt = await ensureProcurementAttempt(rfq, { transaction });
  const attempts = await attemptsForProject(rfq, { transaction });
  if (attempts.at(-1)?.id !== attempt.id) throw workflowError("A later procurement attempt already exists. Continue from the latest attempt.");
  return attempt;
};

const createFollowingRfq = async (req, source, mode, transaction) => {
  const schedule = { closingDate: req.body?.closingDate, openingDate: req.body?.openingDate, prebidAt: req.body?.prebidAt || null };
  const scheduleError = validateAttemptSchedule(schedule);
  if (scheduleError) throw workflowError(scheduleError, 400);
  const lgu = await getLguProfile();
  const limitError = procurementAmountError(source.abc, mode.key, lgu, source.category);
  if (limitError) throw workflowError(limitError, 400);
  const rfq = await Rfq.create({
    referenceNo: await nextSequenceNo(Rfq, "referenceNo", mode.key === "competitiveBidding" ? "ITB" : "RFQ", new Date().getFullYear(), { transaction }),
    title: source.title, abc: source.abc, category: source.category, ...schedule,
    prebidRequired: requiresPrebidConference(Number(source.abc), lgu, source.category),
    postingRequired: mode.key !== "smallValueProcurement" || Number(source.abc) > postingExemptionFor(lgu, source.category),
    isEarlyProcurement: source.isEarlyProcurement, prHeaderId: source.prHeaderId, appEntryId: source.appEntryId,
    procurementModeId: mode.id, status: "draft", qualityWeight: source.qualityWeight, financialWeight: source.financialWeight,
    consultingPassingScore: source.consultingPassingScore, twgRequired: true,
  }, { transaction });
  const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
  return { rfq, attempt };
};

export const createRebid = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const source = await rfqFor(req.params.id, transaction);
    const sourceAttempt = await latestFailedAttempt(source, transaction);
    const policy = await getProcurementPolicy({ transaction });
    const evidence = negotiatedEligibility([...(await attemptsForProject(source, { transaction }))], { ...policy, requiredFailedAttempts: 1 });
    const evidenceMissing = evidence.missing.filter((message) => !message.includes("failed procurement attempts are required"));
    if (evidenceMissing.length) throw workflowError(`Rebid cannot proceed. ${evidenceMissing[0]}`, 409, { missing: evidenceMissing });
    const review = await findNegotiatedReview(sourceAttempt, { transaction });
    if (review && ["pending", "approved", "started"].includes(review.status)) throw workflowError("Resolve the pending Negotiated Procurement review before creating a rebid.");
    const mode = await ProcurementMode.findByPk(source.procurementModeId, { transaction });
    if (!mode) throw workflowError("The original procurement method no longer exists.");
    const { rfq, attempt } = await createFollowingRfq(req, source, mode, transaction);
    await audit(actorAudit(req, { actionType: "bidding.rebid.created", entityRef: "rfq", entityId: rfq.id,
      summary: `${rfq.referenceNo}: procurement attempt #${attempt.attemptNumber} created`,
      beforeState: { sourceRfqId: source.id, sourceAttemptId: sourceAttempt.id }, afterState: { rfqId: rfq.id, projectKey: attempt.projectKey, attemptNumber: attempt.attemptNumber, status: "draft", closingDate: rfq.closingDate, openingDate: rfq.openingDate } }));
    return { id: rfq.id, referenceNo: rfq.referenceNo, status: rfq.status, attemptNumber: attempt.attemptNumber,
      message: `Rebid / Procurement Attempt #${attempt.attemptNumber} created as a draft. Review the schedule and publish the new invitation.` };
  });
  res.status(201).json(result);
};

export const recordAttemptEvidence = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    if (rfq.status !== "failed") throw workflowError("Historical failure evidence can only be recorded for a failed attempt.");
    const attempt = await ensureProcurementAttempt(rfq, { transaction });
    const beforeState = attempt.get({ plain: true });
    const changes = {};
    const bac = await assertBacAction(req, { transaction });
    if (!attempt.failureReason) {
      changes.failureReason = trimmed(req.body?.reason);
      if (!changes.failureReason) throw workflowError("Record the official failure reason.", 400);
    }
    if (!attempt.bacResolutionId) {
      const resolution = await createResolution(req, rfq, bac, "failureOfBidding", changes.failureReason || attempt.failureReason, transaction);
      changes.bacResolutionId = resolution.id;
    }
    const documents = await normalizeSupportingDocuments(req.body?.supportingDocuments, rfq, { transaction });
    changes.supportingDocuments = [...(attempt.supportingDocuments ?? []), ...documents];
    await attempt.update(changes, { transaction });
    await audit(actorAudit(req, { actionType: "bidding.attempt.evidenceRecorded", entityRef: "rfq", entityId: rfq.id,
      summary: `Official evidence recorded for ${rfq.referenceNo}, attempt #${attempt.attemptNumber}`, beforeState, afterState: { ...changes, attemptNumber: attempt.attemptNumber, bacMembers: committeeSnapshot(bac) } }));
    return { id: attempt.id, message: "Official failure evidence has been added to the attempt history. Review any remaining requirements before continuing." };
  });
  res.json(result);
};

export const submitNegotiatedReview = async (req, res) => {
  const justification = trimmed(req.body?.justification);
  const legalBasis = trimmed(req.body?.legalBasis);
  if (!justification || !legalBasis) throw workflowError("Record the eligibility review justification and applicable legal or policy basis.", 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const attempt = await latestFailedAttempt(rfq, transaction);
    const { eligibility } = await assertNegotiatedEligibility(rfq, { transaction });
    const existing = await findNegotiatedReview(attempt, { transaction });
    if (existing) throw workflowError(`A Negotiated Procurement review already exists with status ${existing.status}.`, 409);
    const supportingDocuments = await normalizeSupportingDocuments(req.body?.supportingDocuments, rfq, { transaction });
    if (!supportingDocuments.length) throw workflowError("Provide the supporting review documents.", 400);
    const review = await NegotiatedReview.create({ sourceAttemptId: attempt.id, reviewerId: req.currentUser.id,
      justification, legalBasis, supportingDocuments, eligibilitySnapshot: eligibility, reviewedAt: new Date(), status: "pending" }, { transaction });
    await audit(actorAudit(req, { actionType: "bidding.negotiated.reviewSubmitted", entityRef: "rfq", entityId: rfq.id,
      summary: `${rfq.referenceNo}: Negotiated Procurement eligibility review submitted`, afterState: { reviewId: review.id, attemptNumber: attempt.attemptNumber, justification, legalBasis, eligibility, supportingDocuments } }));
    return { negotiatedReview: serializeReview(review), message: "Negotiated Procurement eligibility review submitted. A different authorized BAC officer must review and approve it before the process can begin." };
  });
  res.status(201).json(result);
};

export const decideNegotiatedReview = async (req, res) => {
  const decision = req.body?.decision;
  const remarks = trimmed(req.body?.remarks);
  if (!["approved", "rejected"].includes(decision) || !remarks) throw workflowError("Select approve or reject and record the BAC decision remarks.", 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const attempt = await latestFailedAttempt(rfq, transaction);
    const review = await findNegotiatedReview(attempt, { transaction });
    if (!review || review.status !== "pending") throw workflowError("There is no pending eligibility review for this procurement attempt.");
    if (review.reviewerId === req.currentUser.id) throw workflowError("You cannot approve or reject your own eligibility review. Another authorized BAC officer must decide.", 403);
    const bac = await assertBacAction(req, { transaction });
    if (decision === "approved") await assertNegotiatedEligibility(rfq, { transaction });
    const resolution = await createResolution(req, rfq, bac, "adoptAlternativeMode", `${decision}: ${remarks}`, transaction);
    await review.update({ status: decision, decisionRemarks: remarks, approverId: req.currentUser.id, approvedAt: new Date(), bacResolutionId: resolution.id }, { transaction });
    await audit(actorAudit(req, { actionType: `bidding.negotiated.${decision}`, entityRef: "rfq", entityId: rfq.id,
      summary: `${rfq.referenceNo}: Negotiated Procurement review ${decision}`, beforeState: { status: "pending", reviewId: review.id },
      afterState: { status: decision, remarks, resolutionNo: resolution.resolutionNo, attemptNumber: attempt.attemptNumber, bacMembers: committeeSnapshot(bac) } }));
    return { negotiatedReview: serializeReview(review), message: decision === "approved" ? "BAC Resolution successfully approved. The Secretariat may now initiate the Negotiated Procurement process." : "BAC review rejected. The eligibility decision and reasons are recorded; a rebid may be prepared." };
  });
  res.json(result);
};

export const startNegotiatedProcurement = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const source = await rfqFor(req.params.id, transaction);
    const attempt = await latestFailedAttempt(source, transaction);
    await assertNegotiatedEligibility(source, { transaction });
    const review = await findNegotiatedReview(attempt, { transaction });
    if (!review || review.status !== "approved" || !review.bacResolutionId || !review.approverId || review.approverId === review.reviewerId) throw workflowError("Negotiated Procurement cannot proceed. Required independent BAC approval has not yet been completed.");
    const resolution = await BacResolution.findByPk(review.bacResolutionId, { transaction });
    if (!resolution?.quorumMet || !resolution.resolutionNo) throw workflowError("Negotiated Procurement cannot proceed. The BAC approval resolution is incomplete.");
    const mode = await ProcurementMode.findOne({ where: { key: "negotiatedProcurement" }, transaction });
    if (!mode) throw workflowError("Configure the Negotiated Procurement method before starting this process.");
    const created = await createFollowingRfq(req, source, mode, transaction);
    await review.update({ status: "started", resultingRfqId: created.rfq.id }, { transaction });
    await audit(actorAudit(req, { actionType: "bidding.negotiated.started", entityRef: "rfq", entityId: created.rfq.id,
      summary: `${created.rfq.referenceNo}: approved Negotiated Procurement started`, beforeState: { reviewId: review.id, sourceRfqId: source.id, status: "approved" },
      afterState: { projectKey: attempt.projectKey, attemptNumber: created.attempt.attemptNumber, rfqId: created.rfq.id, procurementMethod: mode.key, bacResolutionId: review.bacResolutionId } }));
    return { id: created.rfq.id, referenceNo: created.rfq.referenceNo, status: "draft", attemptNumber: created.attempt.attemptNumber,
      message: "Negotiated Procurement draft created after the approved eligibility review. The Secretariat may now prepare the required procurement documents." };
  });
  res.status(201).json(result);
};
