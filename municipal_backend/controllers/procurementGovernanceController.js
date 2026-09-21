import { Op } from "sequelize";
import { Rfq, Bid, Award } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { ProcurementAttempt, NegotiatedReview, FailureRecord, BacDecisionVote } from "../models/procurementAttemptModel.js";
import { BacResolution } from "../models/bacResolutionModel.js";
import { getLguProfile, getProcurementPolicy } from "../models/systemSettingModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { normalizeResolutionNumber } from "../services/resolutionNumber.js";
import { nextSequenceNo, withSequenceRetry } from "../services/sequenceNo.js";
import { negotiatedEligibility, failureStatusLabel, validateAttemptSchedule, negotiatedDocumentChecklist, negotiatedReadiness } from "../services/attemptPolicy.js";
import { evaluateBacDecision } from "../services/bacCommittee.js";
import { getBacContext, assertBacAction, committeeSnapshot, ensureProcurementAttempt,
  attemptsForProject, assertNegotiatedEligibility, findNegotiatedReview, lockProcurementProject,
  normalizeSupportingDocuments, snapshotAttemptOutcome, assertOfficialBacUser, votesForDecision, assertRecordedBacDecision } from "../services/procurementGovernance.js";
import { procurementAmountError, requiresPrebidConference, postingExemptionFor } from "../services/procurementThresholds.js";
import { normalizeSchedule } from "../services/procurementSchedulePolicy.js";

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
  if (!body.resolutionDate || !Number.isFinite(resolvedAt.getTime()) || resolvedAt > new Date()) throw workflowError("Enter a valid resolution date that is not in the future.", 400);
  return { resolutionNo, resolvedAt };
};

const createResolution = (req, rfq, bac, type, recitals, transaction, approvedInput) => BacResolution.create({
  ...(approvedInput ?? resolutionInput(req.body)), type, title: `${type === "failureOfBidding" ? "Failure of bidding" : "Negotiated procurement decision"}: ${rfq.referenceNo}`,
  recitals, members: committeeSnapshot(bac), quorumMet: true, chairpersonId: bac.presidingId,
  entityRef: "rfq", entityId: rfq.id,
}, { transaction });

const serializeReview = (review) => review ? { id: review.id, status: review.status, reviewerId: review.reviewerId, approverId: review.approverId,
  justification: review.justification, legalBasis: review.legalBasis, decisionRemarks: review.decisionRemarks, reviewedAt: review.reviewedAt,
  approvedAt: review.approvedAt, bacResolutionId: review.bacResolutionId, resultingRfqId: review.resultingRfqId, supportingDocuments: review.supportingDocuments, committeeReview: review.committeeReview } : null;

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
  const reviewVotes = review ? await votesForDecision("negotiated", review.id) : [];
  const rows = [];
  for (const attempt of attempts) {
    const record = attempt.rfq;
    const snapshot = attempt.status === "ongoing" ? { ...(attempt.outcomeSnapshot ?? {}), ...await snapshotAttemptOutcome(record) } : attempt.outcomeSnapshot ?? {};
    const disclosed = ["evaluated", "awarded"].includes(record?.status) || snapshot.wasDisclosed === true;
    const bids = await Bid.findAll({ where: { rfqId: attempt.rfqId }, attributes: ["id", "vendorId", "blindLabel", "status"] });
    rows.push({ id: attempt.id, rfqId: attempt.rfqId, attemptNumber: attempt.attemptNumber,
      status: record?.status === "awarded" ? "successful" : record?.status === "cancelled" ? "cancelled" : attempt.status,
      statusLabel: attempt.status === "failed" ? failureStatusLabel(attempt.attemptNumber) : record?.status ?? attempt.status, rfqStatus: record?.status,
      referenceNo: record?.referenceNo, title: record?.title, category: record?.category, method: record?.mode?.name, modeKey: record?.mode?.key,
      startedAt: attempt.startedAt, closingDate: record?.closingDate, openingDate: record?.openingDate, completedAt: attempt.completedAt,
      failureReason: attempt.failureReason, nextAction: attempt.nextAction, responsibleUser: attempt.responsibleUser,
      failureRecords: await Promise.all((attempt.failureRecords ?? []).sort((a, b) => a.id - b.id).map(async (record) => {
        const votes = await votesForDecision("failure", record.id);
        return { ...record.get({ plain: true }), votes, decisionReadiness: evaluateBacDecision({ committeeReview: record.committeeReview, votes }) };
      })),
      participatingBidders: bids.map((bid) => ({ bidId: bid.id, vendorId: disclosed ? bid.vendorId : null, name: (disclosed ? snapshot.participatingBidders?.find((row) => row.bidId === bid.id)?.vendorName : null) || bid.blindLabel || `Bid #${bid.id}`, status: bid.status })),
      evaluationResult: disclosed ? snapshot.evaluationResult ?? [] : (snapshot.evaluationResult ?? []).map((row) => ({ bidId: row.bidId, status: row.status })),
      twgRecommendations: disclosed ? snapshot.twgRecommendations ?? [] : (snapshot.twgRecommendations ?? []).map((row) => ({ bidId: row.bidId, recommendation: row.recommendation, submittedAt: row.submittedAt })),
      resolution: attempt.resolution ? { id: attempt.resolution.id, resolutionNo: normalizeResolutionNumber(attempt.resolution.resolutionNo), resolvedAt: attempt.resolution.resolvedAt, quorumMet: attempt.resolution.quorumMet, members: attempt.resolution.members } : null,
      bacDecision: snapshot.bacDecision ?? (record?.status === "awarded" ? "Award approved" : attempt.resolution?.type === "recommendAward" ? "Recommended for award" : record?.status === "evaluated" ? "Evaluation completed" : null), supportingDocuments: attempt.supportingDocuments,
    });
  }
  res.json({ attempts: rows, eligibility: negotiatedEligibility(attempts, policy), negotiatedReview: review ? { ...serializeReview(review), votes: reviewVotes } : null,
    negotiatedReadiness: negotiatedReadiness({ attempts, review, votes: reviewVotes, category: rfq.category, policy }), policy });
};

const failureForAttempt = (attempt, transaction) => FailureRecord.findOne({ where: { attemptId: attempt.id }, order: [["id", "DESC"]], transaction });

const assertFailureStage = async (rfq, transaction, { category } = {}) => {
  if (!["closed", "opened", "evaluated", "failed"].includes(rfq.status)) throw workflowError(`Failure documents cannot be prepared while this attempt is ${rfq.status}. Close submissions and complete the applicable evaluation first.`);
  const award = await Award.findOne({ where: { rfqId: rfq.id, status: { [Op.in]: ["pendingHopeApproval", "issued", "accepted"] } }, transaction });
  if (award) throw workflowError("Resolve the existing award recommendation before declaring this procurement failed.");
  // Historical failure recovery records new official evidence without changing
  // legacy bidder outcomes or pretending past evaluation steps occurred.
  if (rfq.status === "failed") return;
  const bids = await Bid.findAll({ where: { rfqId: rfq.id, status: { [Op.ne]: "withdrawn" } }, transaction });
  if (bids.length && !["evaluated", "failed"].includes(rfq.status)) throw workflowError("Open received bids and complete the applicable technical evaluation and BAC decision before preparing Failure of Bidding.");
  const mode = await ProcurementMode.findByPk(rfq.procurementModeId, { transaction });
  const insufficientOffers = category === "insufficientOffers" && bids.length < Number(mode?.minimumOffers ?? 1);
  if (category === "insufficientOffers" && !insufficientOffers) throw workflowError("The number of received offers meets the configured minimum; insufficient offers is not a valid failure ground.");
  if (!insufficientOffers && bids.some((bid) => ["submitted", "opened", "technicalPassed", "financialOpened", "postQualified", "awarded"].includes(bid.status))) throw workflowError("A responsive bidder remains. Complete its required evaluation or post-qualification decision before declaring failure.");
};

const failureDetails = async (req, rfq, transaction) => {
  const reason = trimmed(req.body?.reason), category = trimmed(req.body?.category), explanation = trimmed(req.body?.explanation);
  if (!reason || !category || !explanation) throw workflowError("Record the failure reason, failure category and detailed explanation.", 400);
  if (category.length > 64) throw workflowError("Failure category must be at most 64 characters.", 400);
  const supportingDocuments = await normalizeSupportingDocuments(req.body?.supportingDocuments, rfq, { transaction });
  return { reason, category, explanation, twgRecommendation: trimmed(req.body?.twgRecommendation) || null, supportingDocuments };
};

export const prepareFailureRecord = async (req, res) => {
  const result = await withSequenceRetry(() => withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    await assertFailureStage(rfq, transaction, req.body);
    const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
    const latest = (await attemptsForProject(rfq, { transaction })).at(-1);
    if (latest?.id !== attempt.id && rfq.status !== "failed") throw workflowError("Prepare failure documents only for the current attempt.");
    let record = await failureForAttempt(attempt, transaction);
    if (record && !["draft", "rejected"].includes(record.status)) throw workflowError("Submitted and approved failure records are locked. Complete the existing BAC review.");
    const details = await failureDetails(req, rfq, transaction);
    const beforeState = record?.get({ plain: true }) ?? null;
    if (record?.status === "draft") await record.update(details, { transaction });
    else record = await FailureRecord.create({ ...details, attemptId: attempt.id, failureNumber: await nextSequenceNo(FailureRecord, "failureNumber", "FOB", new Date().getFullYear(), { transaction }), createdById: req.currentUser.id }, { transaction });
    await audit(actorAudit(req, { actionType: "bidding.failure.prepared", entityRef: "rfq", entityId: rfq.id, summary: `${record.failureNumber}: failure documents prepared`, beforeState,
      afterState: { ...record.get({ plain: true }), procurementAttemptId: attempt.id, attemptNumber: attempt.attemptNumber } }));
    return { failureRecord: record, message: "Draft failure documents saved. Submit them to the BAC for review; the attempt has not been officially declared failed." };
  }));
  res.status(201).json(result);
};

export const submitFailureRecord = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const attempt = await ensureProcurementAttempt(rfq, { transaction });
    const record = await failureForAttempt(attempt, transaction);
    if (!record || record.status !== "draft") throw workflowError("Prepare a draft Failure of Bidding record before submitting it to BAC.");
    await assertFailureStage(rfq, transaction, record);
    const policy = await getProcurementPolicy({ transaction });
    if (policy.requireFailureDocuments && !record.supportingDocuments?.some((document) => document.documentId)) throw workflowError("Upload the official supporting failure documents before submitting to BAC.", 400);
    await record.update({ status: "submitted", submittedAt: new Date() }, { transaction });
    await audit(actorAudit(req, { actionType: "bidding.failure.submitted", entityRef: "rfq", entityId: rfq.id, summary: `${record.failureNumber}: submitted to BAC`, beforeState: { status: "draft" }, afterState: { failureRecordId: record.id, procurementAttemptId: attempt.id, status: "submitted" } }));
    return { failureRecord: record, message: "Failure documents were submitted to the BAC for review. The procurement has not yet been officially declared failed." };
  });
  res.json(result);
};

const recordCommitteeReview = async (req, rfq, record, subjectType, transaction, audit) => {
  const bac = await assertBacAction(req, { transaction });
  assertOfficialBacUser(req, bac.committee);
  if (!bac.present.some((member) => member.id === req.currentUser.id)) throw workflowError("The BAC official recording this review must be included in meeting attendance.", 403);
  const preparedById = subjectType === "failure" ? record.createdById : record.reviewerId;
  if (preparedById === req.currentUser.id) throw workflowError("Another authorized BAC official must review the documents you prepared.", 403);
  const remarks = trimmed(req.body?.remarks);
  if (!remarks) throw workflowError("Record the BAC review findings.", 400);
  const resolution = resolutionInput(req.body);
  const committeeReview = { committee: bac.committee, attendingMemberIds: bac.present.map((member) => member.id), presidingId: bac.presidingId,
    policy: bac.policy, resolution: { resolutionNo: resolution.resolutionNo, resolvedAt: resolution.resolvedAt.toISOString() }, reviewedById: req.currentUser.id, reviewedAt: new Date().toISOString(), remarks };
  await record.update({ committeeReview, ...(subjectType === "failure" ? { status: "reviewed", reviewedAt: new Date(), reviewedById: req.currentUser.id } : {}) }, { transaction });
  await audit(actorAudit(req, { actionType: `bidding.${subjectType}.bacReviewed`, entityRef: "rfq", entityId: rfq.id,
    summary: `${rfq.referenceNo}: BAC review completed; personal member decisions pending`, afterState: { referenceRecordId: record.id, committeeReview } }));
  return { message: "BAC review recorded. Each participating official must sign in and record their own decision before final approval.", record };
};

export const reviewFailureRecord = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const attempt = await ensureProcurementAttempt(rfq, { transaction });
    const record = await failureForAttempt(attempt, transaction);
    if (!record || record.status !== "submitted") throw workflowError("Submit failure documents to BAC before recording the review.");
    return recordCommitteeReview(req, rfq, record, "failure", transaction, audit);
  });
  res.json(result);
};

const personalCommitteeVote = async (req, rfq, record, subjectType, transaction, audit) => {
  const current = await getBacContext({}, { transaction });
  const role = assertOfficialBacUser(req, current.committee);
  const review = record.committeeReview;
  if (!review) throw workflowError("BAC review must be completed before officials can record their decisions.");
  assertOfficialBacUser(req, review.committee);
  if (!review.attendingMemberIds.includes(req.currentUser.id)) throw workflowError("Only officials recorded as present may participate in this BAC decision.", 403);
  const decision = req.body?.decision, remarks = trimmed(req.body?.remarks);
  if (!["approved", "rejected", "abstained"].includes(decision) || !remarks) throw workflowError("Select approve, reject or abstain and record your decision remarks.", 400);
  if (req.body.userId != null && Number(req.body.userId) !== req.currentUser.id) throw workflowError("You may record only your own BAC decision.", 403);
  if (await BacDecisionVote.findOne({ where: { subjectType, subjectId: record.id, userId: req.currentUser.id }, transaction })) throw workflowError("Your BAC decision has already been recorded and is locked.");
  const vote = await BacDecisionVote.create({ subjectType, subjectId: record.id, userId: req.currentUser.id, role, decision, remarks, votedAt: new Date() }, { transaction });
  await audit(actorAudit(req, { actionType: `bidding.${subjectType}.memberDecision`, entityRef: "rfq", entityId: rfq.id, summary: `${rfq.referenceNo}: personal BAC decision ${decision}`, afterState: vote.get({ plain: true }) }));
  return { vote, message: "Your personal BAC decision was recorded. Finalization remains subject to quorum and the required officials' approval." };
};

export const voteFailureRecord = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const attempt = await ensureProcurementAttempt(rfq, { transaction });
    const record = await failureForAttempt(attempt, transaction);
    if (!record || record.status !== "reviewed") throw workflowError("There is no reviewed failure record waiting for BAC decisions.");
    return personalCommitteeVote(req, rfq, record, "failure", transaction, audit);
  });
  res.json(result);
};

export const declareFailureOfBidding = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const current = await getBacContext({}, { transaction });
    assertOfficialBacUser(req, current.committee, { presiding: true });
    const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
    const record = await failureForAttempt(attempt, transaction);
    if (!record || record.status !== "reviewed") throw workflowError("Prepare and submit failure documents, complete BAC review, and obtain personal BAC approvals before finalization.");
    await assertFailureStage(rfq, transaction, record);
    if (record.createdById === req.currentUser.id) throw workflowError("You cannot finalize your own prepared failure record. Another authorized BAC officer must finalize it.", 403);
    const decision = req.body?.decision ?? "approved", remarks = trimmed(req.body?.remarks);
    if (!["approved", "rejected"].includes(decision) || !remarks) throw workflowError("Record the final BAC decision and its remarks.", 400);
    const bac = await assertRecordedBacDecision(req, record, "failure", { transaction, decision });
    const policy = await getProcurementPolicy({ transaction });
    if (policy.requireFailureDocuments && !record.supportingDocuments?.some((document) => document.documentId)) throw workflowError("Required official failure documents are missing.");
    const resolution = await createResolution(req, rfq, bac, "failureOfBidding", `${decision}: ${record.reason}. ${remarks}`, transaction, record.committeeReview.resolution);
    const beforeState = { status: rfq.status, attemptNumber: attempt.attemptNumber, failureRecordStatus: record.status };
    await record.update({ status: decision, decisionRemarks: remarks, approvedById: req.currentUser.id, approvedAt: new Date(), bacResolutionId: resolution.id }, { transaction });
    if (decision === "rejected") {
      await audit(actorAudit(req, { actionType: "bidding.failure.rejected", entityRef: "rfq", entityId: rfq.id, summary: `${record.failureNumber}: failure declaration rejected`, beforeState, afterState: record.get({ plain: true }) }));
      return { failureRecord: record, message: "BAC rejected the proposed failure declaration. The decision and supporting records remain in procurement history." };
    }
    const outcomeSnapshot = await snapshotAttemptOutcome(rfq, { transaction });
    const attempts = await attemptsForProject(rfq, { transaction });
    const numberFailed = attempts.filter((row) => row.id === attempt.id || row.failureRecords?.some((failure) => failure.status === "approved")).length;
    const nextAction = numberFailed >= Math.max(2, bac.policy.requiredFailedAttempts) ? "Negotiated Procurement Eligibility Review" : "Rebid";
    await record.update({ nextAction }, { transaction });
    await attempt.update({ status: "failed", failureReason: record.reason, bacResolutionId: resolution.id, supportingDocuments: record.supportingDocuments, completedAt: new Date(),
      nextAction, responsibleUserId: req.currentUser.id, outcomeSnapshot: { ...outcomeSnapshot, bacDecision: "Failed", failureRecordId: record.id, resolution: resolution.get({ plain: true }), quorum: bac.quorum } }, { transaction });
    await rfq.update({ status: "failed", cancellationReason: record.reason }, { transaction });
    const afterState = { status: "failed", projectKey: attempt.projectKey, procurementAttemptId: attempt.id, attemptNumber: attempt.attemptNumber, failureRecordId: record.id, failureNumber: record.failureNumber,
      reason: record.reason, resolutionNo: resolution.resolutionNo, bacMembers: committeeSnapshot(bac), nextAction, supportingDocuments: record.supportingDocuments };
    for (const actionType of ["bidding.failure.approved", "bidding.failed", ...(numberFailed === 2 ? ["bidding.secondFailure.recorded"] : [])]) {
      await audit(actorAudit(req, { actionType, entityRef: "rfq", entityId: rfq.id, summary: `${record.failureNumber}: attempt #${attempt.attemptNumber} officially declared failed`, beforeState, afterState }));
    }
    return { id: rfq.id, status: "failed", statusLabel: failureStatusLabel(attempt.attemptNumber), failureNumber: record.failureNumber, failureRecord: record, mayNegotiate: false,
      eligibleForReview: numberFailed >= Math.max(2, bac.policy.requiredFailedAttempts), nextAction,
      message: numberFailed >= Math.max(2, bac.policy.requiredFailedAttempts)
        ? "The required bidding attempts have been officially declared failed. The procurement may now proceed to Negotiated Procurement eligibility review."
        : "The first bidding attempt has been officially declared failed. A rebid may now be prepared." };
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
  const lgu = await getLguProfile();
  let schedule;
  try { schedule = normalizeSchedule(req.body ?? {}, { mandatoryPrebid: requiresPrebidConference(Number(source.abc), lgu, source.category) }); }
  catch (error) { throw workflowError(error.message, 400); }
  const scheduleError = validateAttemptSchedule(schedule);
  if (scheduleError) throw workflowError(scheduleError, 400);
  const limitError = procurementAmountError(source.abc, mode.key, lgu, source.category);
  if (limitError) throw workflowError(limitError, 400);
  const rfq = await Rfq.create({
    referenceNo: await nextSequenceNo(Rfq, "referenceNo", mode.key === "competitiveBidding" ? "ITB" : "RFQ", new Date().getFullYear(), { transaction }),
    title: source.title, abc: source.abc, category: source.category, ...schedule, schedulePreparedById: req.currentUser.id,
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
    const official = await FailureRecord.findOne({ where: { attemptId: sourceAttempt.id, status: "approved" }, transaction });
    if (!official?.approvedById || !official?.approvedAt || !official?.bacResolutionId || sourceAttempt.bacResolutionId !== official.bacResolutionId) throw workflowError("Rebid cannot proceed until the current attempt has an approved Failure of Bidding record and BAC resolution.");
    const votes = await votesForDecision("failure", official.id, { transaction });
    const decision = evaluateBacDecision({ committeeReview: official.committeeReview, votes });
    if (!decision.ok) throw workflowError(`Rebid cannot proceed. ${decision.message}`);
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

// Legacy evidence route enters the same draft/review/approval process. It never
// invents official approvals or rewrites a completed failure record.
export const recordAttemptEvidence = prepareFailureRecord;

export const submitNegotiatedReview = async (req, res) => {
  const justification = trimmed(req.body?.justification);
  const legalBasis = trimmed(req.body?.legalBasis);
  if (!justification || !legalBasis) throw workflowError("Record the eligibility review justification and applicable legal or policy basis.", 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const attempt = await latestFailedAttempt(rfq, transaction);
    const { eligibility, policy } = await assertNegotiatedEligibility(rfq, { transaction });
    const existing = await findNegotiatedReview(attempt, { transaction });
    if (existing) throw workflowError(`A Negotiated Procurement review already exists with status ${existing.status}.`, 409);
    const supportingDocuments = await normalizeSupportingDocuments(req.body?.supportingDocuments, rfq, { transaction });
    const missing = negotiatedDocumentChecklist(supportingDocuments, rfq.category, policy).filter((item) => item.required && !item.complete).map((item) => `${item.label} is missing.`);
    if (missing.length) throw workflowError(`Negotiated Procurement cannot begin yet. ${missing.join(" ")}`, 400, { missing });
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
    const bac = await assertRecordedBacDecision(req, review, "negotiated", { transaction, decision });
    if (decision === "approved") {
      const { policy } = await assertNegotiatedEligibility(rfq, { transaction });
      const missing = negotiatedDocumentChecklist(review.supportingDocuments, rfq.category, policy).filter((item) => item.required && !item.complete).map((item) => `${item.label} is missing.`);
      if (missing.length) throw workflowError(`Negotiated Procurement cannot begin yet. ${missing.join(" ")}`, 409, { missing });
    }
    const resolution = await createResolution(req, rfq, bac, "adoptAlternativeMode", `${decision}: ${remarks}`, transaction, review.committeeReview.resolution);
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
    const { attempts, policy } = await assertNegotiatedEligibility(source, { transaction });
    const review = await findNegotiatedReview(attempt, { transaction });
    if (!review || review.status !== "approved" || !review.bacResolutionId || !review.approverId || review.approverId === review.reviewerId) throw workflowError("Negotiated Procurement cannot proceed. Required independent BAC approval has not yet been completed.");
    const votes = await votesForDecision("negotiated", review.id, { transaction });
    const readiness = negotiatedReadiness({ attempts, review, votes, category: source.category, policy });
    if (!readiness.eligible) throw workflowError(`Negotiated Procurement cannot begin yet. ${readiness.missing.join(" ")}`, 409, { missing: readiness.missing });
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

export const reviewNegotiatedDocuments = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const attempt = await latestFailedAttempt(rfq, transaction);
    const review = await findNegotiatedReview(attempt, { transaction });
    if (!review || review.status !== "pending" || review.committeeReview) throw workflowError("There is no eligibility submission awaiting BAC review.");
    await assertNegotiatedEligibility(rfq, { transaction });
    return recordCommitteeReview(req, rfq, review, "negotiated", transaction, audit);
  });
  res.json(result);
};

export const voteNegotiatedReview = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await rfqFor(req.params.id, transaction);
    const attempt = await latestFailedAttempt(rfq, transaction);
    const review = await findNegotiatedReview(attempt, { transaction });
    if (!review || review.status !== "pending") throw workflowError("There is no eligibility review awaiting personal BAC decisions.");
    return personalCommitteeVote(req, rfq, review, "negotiated", transaction, audit);
  });
  res.json(result);
};
