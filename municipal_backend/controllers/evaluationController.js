import { Op } from "sequelize";
import { Rfq, Bid, Evaluation } from "../models/biddingModel.js";
import { TwgAssessment } from "../models/twgModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { evaluationError, technicalAverage, combinedScores, assessmentCompliant, weightError } from "../services/evaluationPolicy.js";
import { assertBacAction, committeeSnapshot } from "../services/procurementGovernance.js";
import { Vendor } from "../models/vendorModel.js";
import { notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";

export const submitEvaluation = async (req, res) => {
  if (req.body.noConflictDeclared !== true) throw workflowError("Declare that you have no conflict of interest before evaluating this procurement.", 400);
  const evaluation = await withAuditTransaction(async (transaction, audit) => {
    const bid = await Bid.findByPk(req.params.bidId, { transaction });
    if (!bid) throw workflowError("Bid not found.", 404);
    const rfq = await Rfq.findByPk(bid.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    if (rfq.status !== "opened" || bid.status !== "opened") throw workflowError("Evaluation is not open for this procurement.");
    const twg = await TwgAssessment.findAll({ where: { bidId: bid.id, status: "submitted" }, transaction });
    if (rfq.twgRequired && !twg.length) throw workflowError("The TWG must submit its technical assessment and recommendation before BAC evaluation.");
    if (twg.some((row) => row.memberId === req.currentUser.id)) throw workflowError("You cannot approve or review your own TWG assessment. Another authorized BAC evaluator must review it.", 403);
    if (await Evaluation.findOne({ where: { bidId: bid.id, evaluatorId: req.currentUser.id }, transaction })) throw workflowError("You have already evaluated this bid. Submitted evaluations cannot be changed.");
    const error = evaluationError({ ...req.body, category: rfq.category });
    if (error) throw workflowError(error, 400);
    const rated = rfq.category === "consulting";
    const score = rated ? technicalAverage(Object.values(req.body.criteriaBreakdown).map((value) => ({ score: value }))) : req.body.verdict === "passed" ? 100 : 0;
    if (!rated && score === 100 && twg.some((row) => !assessmentCompliant(row))) throw workflowError("A bidder that fails mandatory TWG technical requirements cannot be declared compliant.");
    const created = await Evaluation.create({ bidId: bid.id, evaluatorId: req.currentUser.id, criteriaBreakdown: rated ? req.body.criteriaBreakdown : { verdict: req.body.verdict, requirementsExamined: req.body.criteriaBreakdown }, score, blindFlag: true, remarks: req.body.remarks ?? null, noConflictDeclared: true, declaredAt: new Date(), submittedAt: new Date() }, { transaction });
    await audit(actorAudit(req, { actionType: "evaluation.conflictDeclared", entityRef: "bid", entityId: bid.id, summary: "BAC evaluator declared no conflict of interest.", afterState: { rfqId: rfq.id, evaluationId: created.id, noConflictDeclared: true, declaredAt: created.declaredAt } }));
    await audit(actorAudit(req, { actionType: "evaluation.submitted", entityRef: "bid", entityId: bid.id, summary: "BAC evaluation submitted after review of the TWG assessment.", afterState: { rfqId: rfq.id, evaluationId: created.id, score, criteriaBreakdown: created.criteriaBreakdown, reviewedTwgIds: twg.map((row) => row.id), noConflictDeclared: true } }));
    return created;
  });
  res.status(201).json({ id: evaluation.id, score: Number(evaluation.score), blindFlag: true, message: "Bid evaluation submitted. The BAC may finalize evaluation after all bids are reviewed and quorum is confirmed." });
};

export const closeEvaluation = async (req, res) => {
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("Procurement not found.", 404);
    if (rfq.status !== "opened") throw workflowError("BAC evaluation can only be finalized after bid opening.");
    const context = await assertBacAction(req, { transaction });
    if (rfq.category === "consulting") {
      const error = weightError(rfq.qualityWeight, rfq.financialWeight);
      if (error) throw workflowError(error);
    }
    const bids = await Bid.findAll({ where: { rfqId: rfq.id, status: { [Op.ne]: "withdrawn" } }, include: [{ model: Evaluation, as: "evaluations" }, { model: TwgAssessment, as: "twgAssessments" }], transaction });
    if (!bids.length) throw workflowError("No bids are available for evaluation. Record a BAC failed-bidding resolution.");
    for (const bid of bids) {
      const submitted = bid.twgAssessments.filter((row) => row.status === "submitted");
      if (rfq.twgRequired && !submitted.length) throw workflowError(`TWG assessment and recommendation for ${bid.blindLabel} must be submitted before the BAC final decision.`);
      if (rfq.twgRequired && bid.twgAssessments.some((row) => row.status === "draft")) throw workflowError(`Complete the pending TWG draft for ${bid.blindLabel} before the BAC final decision.`);
      if (!bid.evaluations.length) throw workflowError(`${bid.blindLabel} has no BAC evaluation. Every bid must be reviewed before finalization.`);
      if (submitted.some((row) => !row.noConflictDeclared || !row.declaredAt || !row.remarks?.trim() || !row.recommendation)) throw workflowError(`Complete the TWG declaration and written recommendation for ${bid.blindLabel}.`);
    }
    const responsive = bids.filter((bid) => {
      const twgPassed = !rfq.twgRequired || bid.twgAssessments.filter((row) => row.status === "submitted").every(assessmentCompliant);
      const evaluated = rfq.category === "consulting" ? technicalAverage(bid.evaluations) >= Number(rfq.consultingPassingScore) : bid.evaluations.every((row) => Number(row.score) === 100);
      return twgPassed && evaluated && Number(bid.totalBidPrice) > 0 && Number(bid.totalBidPrice) <= Number(rfq.abc);
    });
    const lowestPrice = Math.min(...responsive.map((bid) => Number(bid.totalBidPrice)));
    const results = [];
    for (const bid of bids) {
      const passed = responsive.some((row) => row.id === bid.id);
      const scores = passed && rfq.category === "consulting" ? combinedScores({ qualityScore: technicalAverage(bid.evaluations), price: bid.totalBidPrice, lowestPrice, qualityWeight: rfq.qualityWeight, financialWeight: rfq.financialWeight }) : { qualityScore: null, financialScore: null, combinedScore: null };
      await bid.update({ status: passed ? "technicalPassed" : "technicalFailed", financialSealed: !passed, ...scores }, { transaction });
      results.push({ bidId: bid.id, status: bid.status, ...scores });
    }
    await rfq.update({ status: "evaluated" }, { transaction });
    await audit(actorAudit(req, { actionType: "evaluation.closed", entityRef: "rfq", entityId: rfq.id, summary: "BAC finalized evaluation with TWG review and recorded quorum; responsive bids proceed to post-qualification.", beforeState: { status: "opened" }, afterState: { status: "evaluated", results, qualityWeight: rfq.category === "consulting" ? rfq.qualityWeight : null, financialWeight: rfq.category === "consulting" ? rfq.financialWeight : null, quorum: context.quorum, members: committeeSnapshot(context), presidingMemberId: context.presidingId } }));
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
