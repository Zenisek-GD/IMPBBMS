import { Op } from "sequelize";
import { Rfq, Bid, Evaluation } from "../models/biddingModel.js";
import { TwgAssessment } from "../models/twgModel.js";
import { EvaluatorDeclaration, EvaluationReturn } from "../models/evaluationWorkflowModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { evaluationError, technicalAverage, combinedScores, assessmentCompliant, activeEvaluations, consultingQualityScore, consultingMinimumsMet } from "../services/evaluationPolicy.js";
import { assertApprovedEvaluationPlan } from "../services/evaluationPlan.js";
import { recordEvaluatorDeclaration } from "./evaluationWorkflowController.js";
import { normalizeSupportingDocuments, ensureProcurementAttempt, assertNoPendingFailure } from "../services/procurementGovernance.js";
import { assertBacAction, committeeSnapshot } from "../services/procurementGovernance.js";
import { Vendor } from "../models/vendorModel.js";
import { notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";

export const submitEvaluation = async (req, res) => {
  if (req.body.noConflictDeclared !== true) throw workflowError("Declare that you have no conflict of interest before evaluating this procurement.", 400);
  const evaluation = await withAuditTransaction(async (transaction, audit) => {
    const bid = await Bid.findByPk(req.params.bidId, { transaction });
    if (!bid) throw workflowError("Bid not found.", 404);
    const rfq = await Rfq.findByPk(bid.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    await assertNoPendingFailure(rfq, { transaction });
    if (rfq.status !== "opened" || bid.status !== "opened") throw workflowError("Evaluation is not open for this procurement.");
    const twg = await TwgAssessment.findAll({ where: { bidId: bid.id, status: "submitted", excludedForConflict: false }, transaction });
    if (rfq.twgRequired && !twg.length) throw workflowError("The TWG must submit its technical assessment and recommendation before BAC evaluation.");
    if (twg.some((row) => row.memberId === req.currentUser.id)) throw workflowError("You cannot approve or review your own TWG assessment. Another authorized BAC evaluator must review it.", 403);
    const previous = await Evaluation.findOne({ where: { bidId: bid.id, evaluatorId: req.currentUser.id }, order: [["id", "DESC"]], transaction });
    if (previous && previous.status !== "returned") throw workflowError("You have already evaluated this bid. An authorized return for correction is required before resubmitting.");
    const plan = await assertApprovedEvaluationPlan(rfq, { transaction });
    if (["qualityWeight", "financialWeight", "evaluationMethod", "financialMethod", "criteria", "maxScore", "criterionWeight", "passingScore"].some((key) => Object.hasOwn(req.body, key))) throw workflowError("Approved criteria and weights cannot be changed during evaluation.", 400);
    const error = evaluationError({ ...req.body, category: rfq.category, plan });
    if (error) throw workflowError(error, 400);
    if (req.body.remarks != null && typeof req.body.remarks !== "string") throw workflowError("Evaluation remarks must be written text.", 400);
    if (req.body.requirementRemarks != null && (typeof req.body.requirementRemarks !== "object" || Array.isArray(req.body.requirementRemarks) || Object.entries(req.body.requirementRemarks).some(([key, value]) => !Object.hasOwn(req.body.criteriaBreakdown, key) || typeof value !== "string"))) throw workflowError("Record text remarks only for the requirements being evaluated.", 400);
    if (typeof req.body.recommendation !== "string" || !req.body.recommendation.trim()) throw workflowError("Record the evaluator recommendation before submitting.", 400);
    const declaration = await recordEvaluatorDeclaration(req, rfq, { transaction, audit, declared: true });
    const rated = rfq.category === "consulting";
    const score = rated ? consultingQualityScore(req.body.criteriaBreakdown, plan) : req.body.verdict === "passed" ? 100 : 0;
    if (!rated && score === 100 && twg.some((row) => !assessmentCompliant(row))) throw workflowError("A bidder that fails mandatory TWG technical requirements cannot be declared compliant.");
    const supportingDocuments = await normalizeSupportingDocuments(req.body.supportingDocuments, rfq, { transaction });
    const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
    if (!previous) await audit(actorAudit(req, { actionType: "evaluation.started", entityRef: "bid", entityId: bid.id, summary: "Authorized BAC evaluator started the procurement-category evaluation.", afterState: { rfqId: rfq.id, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, evaluatorId: req.currentUser.id, category: rfq.category, evaluationPlanId: plan?.id ?? null } }));
    const created = await Evaluation.create({ bidId: bid.id, evaluatorId: req.currentUser.id, criteriaBreakdown: rated ? req.body.criteriaBreakdown : { verdict: req.body.verdict, requirementsExamined: req.body.criteriaBreakdown }, score, blindFlag: true, remarks: req.body.remarks ?? null, noConflictDeclared: true, declaredAt: declaration.declaredAt, submittedAt: new Date(), status: "submitted", failureReason: req.body.verdict === "failed" ? req.body.failureReason : null, failureExplanation: req.body.verdict === "failed" ? req.body.failureExplanation ?? req.body.remarks : null, requirementRemarks: req.body.requirementRemarks ?? {}, recommendation: req.body.recommendation.trim(), supportingDocuments, evaluationPlanId: plan?.id ?? null }, { transaction });
    if (previous) {
      const correction = await EvaluationReturn.findOne({ where: { targetType: "evaluation", targetId: previous.id, correctedAt: null }, transaction });
      if (!correction) throw workflowError("The authorized correction record is missing; resubmission cannot proceed.");
      await correction.update({ correctedAt: new Date(), updatedSubmission: created.toJSON() }, { transaction });
      await previous.update({ status: "superseded" }, { transaction });
    }
    await audit(actorAudit(req, { actionType: "evaluation.conflictDeclared", entityRef: "bid", entityId: bid.id, summary: "BAC evaluator declared no conflict of interest.", afterState: { rfqId: rfq.id, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, evaluationId: created.id, evaluatorId: req.currentUser.id, declarationId: declaration.id, declarationRole: declaration.role, noConflictDeclared: true, declaredAt: created.declaredAt } }));
    await audit(actorAudit(req, { actionType: "evaluation.submitted", entityRef: "bid", entityId: bid.id, summary: "BAC evaluation submitted after review of the TWG assessment.", afterState: { ...created.toJSON(), rfqId: rfq.id, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, evaluationId: created.id, reviewedTwgIds: twg.map((row) => row.id), declarationId: declaration.id, declarationRole: declaration.role } }));
    return created;
  });
  res.status(201).json({ id: evaluation.id, score: Number(evaluation.score), blindFlag: true, message: evaluation.failureReason ? "Evaluation submitted. The bid was marked as failed with its non-compliance reason. The BAC will review the completed evaluations." : "Evaluation submitted successfully and locked. The BAC may finalize the evaluation after all required reviews and quorum are complete." });
};

export const closeEvaluation = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("Procurement not found.", 404);
    await assertNoPendingFailure(rfq, { transaction });
    if (rfq.status !== "opened") throw workflowError("BAC evaluation can only be finalized after bid opening.");
    const context = await assertBacAction(req, { transaction });
    const plan = await assertApprovedEvaluationPlan(rfq, { transaction });
    const bids = await Bid.findAll({ where: { rfqId: rfq.id, status: { [Op.ne]: "withdrawn" } }, include: [{ model: Evaluation, as: "evaluations" }, { model: TwgAssessment, as: "twgAssessments" }], transaction });
    if (!bids.length) throw workflowError("No bids are available for evaluation. Record a BAC failed-bidding resolution.");
    for (const bid of bids) {
      if (bid.evaluations.some((row) => row.status === "returned")) throw workflowError(`Complete the returned evaluation for ${bid.blindLabel} before BAC finalization.`);
      bid.evaluations = activeEvaluations(bid.evaluations);
      const submitted = bid.twgAssessments.filter((row) => row.status === "submitted" && !row.excludedForConflict);
      if (rfq.twgRequired && !submitted.length) throw workflowError(`TWG assessment and recommendation for ${bid.blindLabel} must be submitted before the BAC final decision.`);
      if (rfq.twgRequired && bid.twgAssessments.some((row) => row.status === "draft" && !row.excludedForConflict)) throw workflowError(`Complete the pending TWG draft for ${bid.blindLabel} before the BAC final decision.`);
      if (!bid.evaluations.length) throw workflowError(`${bid.blindLabel} has no BAC evaluation. Every bid must be reviewed before finalization.`);
      if (bid.evaluations.some((row) => !row.noConflictDeclared || !row.declaredAt)) throw workflowError(`Every BAC evaluator for ${bid.blindLabel} must record their own conflict-of-interest declaration.`);
      const conflicted = await EvaluatorDeclaration.findOne({ where: { rfqId: rfq.id, noConflictDeclared: false, userId: { [Op.in]: [...bid.evaluations.map((row) => row.evaluatorId), ...submitted.map((row) => row.memberId)] } }, transaction });
      if (conflicted) throw workflowError(`A participating evaluator for ${bid.blindLabel} reported a conflict of interest. Resolve the reassignment before finalization.`);
      if (submitted.some((row) => !row.noConflictDeclared || !row.declaredAt || !row.remarks?.trim() || !row.recommendation)) throw workflowError(`Complete the TWG declaration and written recommendation for ${bid.blindLabel}.`);
    }
    const responsive = bids.filter((bid) => {
      const twgPassed = !rfq.twgRequired || bid.twgAssessments.filter((row) => row.status === "submitted" && !row.excludedForConflict).every(assessmentCompliant);
      const evaluated = rfq.category === "consulting" ? technicalAverage(bid.evaluations) >= Number(plan.passingScore) && bid.evaluations.every((row) => row.evaluationPlanId === plan.id && consultingMinimumsMet(row.criteriaBreakdown, plan)) : bid.evaluations.every((row) => Number(row.score) === 100);
      return twgPassed && evaluated && Number(bid.totalBidPrice) > 0 && Number(bid.totalBidPrice) <= Number(rfq.abc);
    });
    const lowestPrice = Math.min(...responsive.map((bid) => Number(bid.totalBidPrice)));
    const results = [];
    for (const bid of bids) {
      const passed = responsive.some((row) => row.id === bid.id);
      const failureReasons = passed ? [] : [
        ...bid.evaluations.filter((row) => row.failureReason).map((row) => `${row.failureReason}: ${row.failureExplanation || row.remarks || "Non-compliance recorded"}`),
        ...(Number(bid.totalBidPrice) <= 0 || Number(bid.totalBidPrice) > Number(rfq.abc) ? ["Bid price is invalid or exceeds the approved budget."] : []),
        ...(rfq.twgRequired && bid.twgAssessments.some((row) => row.status === "submitted" && !row.excludedForConflict && !assessmentCompliant(row)) ? ["The bid did not satisfy mandatory TWG technical requirements."] : []),
        ...(plan && (technicalAverage(bid.evaluations) < Number(plan.passingScore) || bid.evaluations.some((row) => !consultingMinimumsMet(row.criteriaBreakdown, plan))) ? ["The bid did not meet the approved quality passing score or criterion minimum."] : []),
      ];
      const scores = passed && rfq.category === "consulting" ? combinedScores({ qualityScore: technicalAverage(bid.evaluations), price: bid.totalBidPrice, lowestPrice, qualityWeight: rfq.qualityWeight, financialWeight: rfq.financialWeight }) : { qualityScore: null, financialScore: null, combinedScore: null };
      await bid.update({ status: passed ? "technicalPassed" : "technicalFailed", financialSealed: !passed, ...scores }, { transaction });
      results.push({ bidId: bid.id, status: bid.status, failureReasons, ...scores });
    }
    await rfq.update({ status: "evaluated" }, { transaction });
    const attempt = await ensureProcurementAttempt(rfq, { transaction, actorId: req.currentUser.id });
    await audit(actorAudit(req, { actionType: "evaluation.closed", entityRef: "rfq", entityId: rfq.id, summary: "BAC finalized evaluation with TWG review and recorded quorum; responsive bids proceed to post-qualification.", beforeState: { status: "opened" }, afterState: { status: "evaluated", attemptId: attempt.id, attemptNumber: attempt.attemptNumber, results, qualityWeight: rfq.category === "consulting" ? rfq.qualityWeight : null, financialWeight: rfq.category === "consulting" ? rfq.financialWeight : null, quorum: context.quorum, members: committeeSnapshot(context), presidingMemberId: context.presidingId } }));
    return { rfqId: rfq.id, referenceNo: rfq.referenceNo, results };
  });
  const recipients = await Bid.findAll({ where: { rfqId: result.rfqId }, include: [{ model: Vendor, as: "vendor", attributes: ["userId"] }] });
  await Promise.all(recipients.filter((bid) => result.results.some((row) => row.bidId === bid.id)).map((bid) => notifyUsers([bid.vendor?.userId], {
    type: NOTIFICATION_EVENTS.BID_RESULT, title: `Evaluation completed: ${result.referenceNo}`,
    body: bid.status === "technicalPassed" ? "Your bid passed technical evaluation and will proceed according to the financial ranking and post-qualification process." : "Your bid did not pass the required evaluation. Review the result and contact the BAC Secretariat for the applicable next steps.",
    link: "/supplier/opportunities", refEntity: "rfq", refId: result.rfqId, severity: bid.status === "technicalPassed" ? "success" : "warning",
  })));
  res.json({ ...result, message: "BAC evaluation finalized. Responsive bidders are ranked and may now proceed to post-qualification. Non-compliant bids remain excluded." });
};
