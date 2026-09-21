import { Op } from "sequelize";
import { Rfq, Bid, Evaluation } from "../models/biddingModel.js";
import { TwgAssessment } from "../models/twgModel.js";
import { EvaluationPlan, EvaluatorDeclaration, EvaluationReturn, EvaluationCriteriaAmendment } from "../models/evaluationWorkflowModel.js";
import { User } from "../models/userModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { evaluationPlanError, COMPLIANCE_REQUIREMENTS } from "../services/evaluationPolicy.js";
import { assertBacAction, committeeSnapshot, normalizeSupportingDocuments, assertNoPendingFailure } from "../services/procurementGovernance.js";

export const getEvaluationPlan = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id);
  if (!rfq) throw workflowError("Procurement not found.", 404);
  const plan = await EvaluationPlan.findOne({ where: { rfqId: rfq.id } });
  const amendments = await EvaluationCriteriaAmendment.findAll({ where: { rfqId: rfq.id }, order: [["id", "DESC"]] });
  const canAmend = ["draft", "published"].includes(rfq.status) && plan?.status === "approved" && await Bid.count({ where: { rfqId: rfq.id } }) === 0;
  res.json({ category: rfq.category, plan, amendments, canAmend, requirements: COMPLIANCE_REQUIREMENTS[rfq.category] ?? [], locked: rfq.status !== "draft" || plan?.status === "approved" });
};

const assertCriteriaAmendmentStage = async (rfq, transaction) => {
  if (!["draft", "published"].includes(rfq.status) || await Bid.count({ where: { rfqId: rfq.id }, transaction }) > 0) throw workflowError("Criteria cannot change after bids have been submitted or opened. Complete the authorized cancellation or failed-bidding process and prepare a new attempt with revised criteria.");
};
const planValues = (input) => ({ criteria: input.criteria.map(({ key, name, description, maxScore, weight, minimumScore }) => ({ key, name: name.trim(), description: description ?? "", maxScore: Number(maxScore), weight: Number(weight), minimumScore: minimumScore == null || minimumScore === "" ? null : Number(minimumScore) })), qualityWeight: Number(input.qualityWeight), financialWeight: Number(input.financialWeight), passingScore: Number(input.passingScore), financialMethod: input.financialMethod });

export const requestCriteriaAmendment = async (req, res) => {
  if (typeof req.body.reason !== "string" || !req.body.reason.trim()) throw workflowError("Enter the reason for amending the approved criteria.", 400);
  const error = evaluationPlanError(req.body.plan);
  if (error) throw workflowError(error, 400);
  const amendment = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("Procurement not found.", 404);
    await assertCriteriaAmendmentStage(rfq, transaction);
    const plan = await EvaluationPlan.findOne({ where: { rfqId: rfq.id }, transaction });
    if (rfq.category !== "consulting" || plan?.status !== "approved") throw workflowError("An approved consulting evaluation plan is required before requesting an amendment.");
    if (await EvaluationCriteriaAmendment.findOne({ where: { rfqId: rfq.id, status: "submitted" }, transaction })) throw workflowError("A criteria amendment is already waiting for BAC review.");
    const supportingDocuments = await normalizeSupportingDocuments(req.body.supportingDocuments, rfq, { transaction });
    if (!supportingDocuments.length) throw workflowError("Attach the supporting criteria amendment document.", 400);
    const row = await EvaluationCriteriaAmendment.create({ rfqId: rfq.id, requestedById: req.currentUser.id, reason: req.body.reason.trim(), previousPlan: plan.toJSON(), proposedPlan: planValues(req.body.plan), supportingDocuments }, { transaction });
    await audit(actorAudit(req, { actionType: "evaluation.criteriaAmendmentRequested", entityRef: "rfq", entityId: rfq.id, summary: "Approved criteria amendment submitted for BAC review; current criteria remain in effect.", afterState: row.toJSON() }));
    return row;
  });
  res.status(201).json({ amendment, message: "Criteria amendment submitted to the BAC. The approved criteria remain unchanged pending approval." });
};

export const approveCriteriaAmendment = async (req, res) => {
  if (typeof req.body.approvalReference !== "string" || !req.body.approvalReference.trim()) throw workflowError("Enter the BAC approval or amendment resolution reference.", 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const row = await EvaluationCriteriaAmendment.findByPk(req.params.amendmentId, { transaction });
    if (!row) throw workflowError("Criteria amendment not found.", 404);
    const rfq = await Rfq.findByPk(row.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    await row.reload({ transaction });
    if (row.status !== "submitted") throw workflowError("This criteria amendment has already been approved.");
    if (row.requestedById === req.currentUser.id) throw workflowError("Another authorized BAC officer must approve your criteria amendment.", 403);
    await assertCriteriaAmendmentStage(rfq, transaction);
    const plan = await EvaluationPlan.findOne({ where: { rfqId: rfq.id }, transaction });
    if (!plan || plan.revision !== row.previousPlan.revision) throw workflowError("The approved plan has changed since this amendment was requested. Prepare a new amendment.");
    const error = evaluationPlanError(row.proposedPlan);
    if (error) throw workflowError(error, 400);
    const context = await assertBacAction(req, { transaction });
    await plan.update({ ...planValues(row.proposedPlan), revision: plan.revision + 1, approvedById: req.currentUser.id, approvedAt: new Date(), approvalReference: req.body.approvalReference.trim() }, { transaction });
    await rfq.update({ qualityWeight: plan.qualityWeight, financialWeight: plan.financialWeight, consultingPassingScore: plan.passingScore }, { transaction });
    await row.update({ status: "approved", approvedById: req.currentUser.id, approvedAt: new Date(), approvalReference: req.body.approvalReference.trim() }, { transaction });
    await audit(actorAudit(req, { actionType: "evaluation.criteriaAmendmentApproved", entityRef: "rfq", entityId: rfq.id, summary: "BAC approved and applied the criteria amendment; the previous approved criteria are retained.", beforeState: row.previousPlan, afterState: { plan: plan.toJSON(), amendmentId: row.id, supportingDocuments: row.supportingDocuments, quorum: context.quorum, members: committeeSnapshot(context) } }));
    return { amendment: row, plan };
  });
  res.json({ ...result, message: "Criteria amendment approved and applied. The revised criteria are locked and the previous approval remains in the history." });
};

export const saveEvaluationPlan = async (req, res) => {
  const error = evaluationPlanError(req.body);
  if (error) throw workflowError(error, 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("Procurement not found.", 404);
    if (rfq.category !== "consulting") throw workflowError("Goods and Infrastructure use compliance evaluation; quality-price criteria do not apply.", 400);
    const existing = await EvaluationPlan.findOne({ where: { rfqId: rfq.id }, transaction });
    if (rfq.status !== "draft" || existing?.status === "approved") throw workflowError("Approved criteria are locked. Changes require authorized amendment and approval before a new bidding attempt; evaluators cannot edit them.");
    const values = { rfqId: rfq.id, preparedById: req.currentUser.id, status: "draft", criteria: req.body.criteria.map(({ key, name, description, maxScore, weight, minimumScore }) => ({ key, name: name.trim(), description: description ?? "", maxScore: Number(maxScore), weight: Number(weight), minimumScore: minimumScore == null || minimumScore === "" ? null : Number(minimumScore) })), qualityWeight: Number(req.body.qualityWeight), financialWeight: Number(req.body.financialWeight), passingScore: Number(req.body.passingScore), financialMethod: req.body.financialMethod };
    const before = existing?.toJSON() ?? null;
    const plan = existing ? await existing.update(values, { transaction }) : await EvaluationPlan.create(values, { transaction });
    await audit(actorAudit(req, { actionType: "evaluation.criteriaPrepared", entityRef: "rfq", entityId: rfq.id, summary: "Consulting evaluation criteria prepared for BAC approval before bidding.", beforeState: before, afterState: plan.toJSON() }));
    return plan;
  });
  res.json({ plan: result, message: "Evaluation criteria saved. Obtain BAC approval before publishing this procurement." });
};

export const approveEvaluationPlan = async (req, res) => {
  if (!req.body.approvalReference?.trim()) throw workflowError("Enter the BAC approval or resolution reference.", 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("Procurement not found.", 404);
    const plan = await EvaluationPlan.findOne({ where: { rfqId: rfq.id }, transaction });
    if (rfq.category !== "consulting" || rfq.status !== "draft" || !plan || plan.status !== "draft") throw workflowError("Approve consulting criteria while this procurement and evaluation plan are still drafts.");
    if (plan.preparedById === req.currentUser.id) throw workflowError("Another authorized BAC officer must approve the criteria you prepared.", 403);
    const error = evaluationPlanError(plan);
    if (error) throw workflowError(error, 400);
    const context = await assertBacAction(req, { transaction });
    await plan.update({ status: "approved", approvalReference: req.body.approvalReference.trim(), approvedAt: new Date(), approvedById: req.currentUser.id }, { transaction });
    await rfq.update({ qualityWeight: plan.qualityWeight, financialWeight: plan.financialWeight, consultingPassingScore: plan.passingScore }, { transaction });
    await audit(actorAudit(req, { actionType: "evaluation.criteriaApproved", entityRef: "rfq", entityId: rfq.id, summary: "BAC approved and locked the consulting criteria before publication.", afterState: { ...plan.toJSON(), quorum: context.quorum, members: committeeSnapshot(context) } }));
    return plan;
  });
  res.json({ plan: result, message: "Approved evaluation criteria are locked. This procurement may now be published once all other prerequisites are complete." });
};

export const recordEvaluatorDeclaration = async (req, rfq, { transaction, audit, declared }) => {
  await assertNoPendingFailure(rfq, { transaction });
  if (typeof declared !== "boolean") throw workflowError("Confirm whether you have a conflict of interest.", 400);
  if (req.body.userId != null || req.body.memberId != null || req.body.evaluatorId != null) throw workflowError("Declarations can only be recorded by the signed-in evaluator for themselves.", 403);
  let row = await EvaluatorDeclaration.findOne({ where: { rfqId: rfq.id, userId: req.currentUser.id }, transaction });
  if (row?.noConflictDeclared === false) {
    if (declared) throw workflowError("A conflict of interest was recorded. You cannot participate in this procurement; administrative reassignment is required.", 403);
    return row;
  }
  if (row && declared) return row;
  const values = { rfqId: rfq.id, userId: req.currentUser.id, role: req.currentUser.Role?.key ?? "authorizedEvaluator", noConflictDeclared: declared, declaredAt: new Date(), reason: declared ? null : req.body.reason?.trim() || "Evaluator reported a conflict of interest.", reassignmentRequired: !declared };
  const before = row?.toJSON() ?? null;
  row = row ? await row.update(values, { transaction }) : await EvaluatorDeclaration.create(values, { transaction });
  if (!declared) {
    const bids = await Bid.findAll({ where: { rfqId: rfq.id }, attributes: ["id"], transaction });
    if (bids.length) {
      const bidIds = bids.map((bid) => bid.id);
      const evaluations = await Evaluation.findAll({ where: { bidId: { [Op.in]: bidIds }, evaluatorId: req.currentUser.id, status: { [Op.in]: ["submitted", "returned"] } }, transaction });
      const assessments = await TwgAssessment.findAll({ where: { bidId: { [Op.in]: bidIds }, memberId: req.currentUser.id, excludedForConflict: false }, transaction });
      for (const submission of [...evaluations, ...assessments]) {
        const previousSubmission = submission.toJSON();
        const isBac = submission instanceof Evaluation;
        await submission.update(isBac ? { status: "superseded" } : { excludedForConflict: true }, { transaction });
        await audit(actorAudit(req, { actionType: "evaluation.recused", entityRef: isBac ? "evaluation" : "twgAssessment", entityId: submission.id, summary: "Evaluator reported a conflict. The original assessment is retained but excluded; an authorized replacement evaluator must assess the bid.", beforeState: previousSubmission, afterState: { rfqId: rfq.id, declarationId: row.id, excludedForConflict: true } }));
      }
    }
  }
  await audit(actorAudit(req, { actionType: "evaluation.conflictDeclared", entityRef: "rfq", entityId: rfq.id, summary: declared ? "Evaluator declared no conflict of interest with participating bidders." : "Evaluator reported a conflict of interest; participation blocked and reassignment required.", beforeState: before, afterState: row.toJSON() }));
  return row;
};

export const declareEvaluatorConflict = async (req, res) => {
  const declaration = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("Procurement not found.", 404);
    if (rfq.status !== "opened") throw workflowError("Declarations are recorded during the evaluation stage.");
    return recordEvaluatorDeclaration(req, rfq, { transaction, audit, declared: req.body.declared });
  });
  res.status(201).json({ ...declaration.toJSON(), message: declaration.noConflictDeclared ? "Conflict-of-interest declaration recorded. You may prepare your evaluation." : "Conflict of interest recorded. You cannot evaluate this procurement; reassignment is required." });
};

export const returnEvaluationForCorrection = async (req, res) => {
  if (!["bac", "twg"].includes(req.params.kind)) throw workflowError("Choose a BAC evaluation or TWG assessment to return.", 400);
  const targetType = req.params.kind === "twg" ? "twgAssessment" : "evaluation";
  if (!req.body.reason?.trim()) throw workflowError("Enter the reason for returning the evaluation.", 400);
  const result = await withAuditTransaction(async (transaction, audit) => {
    const Model = targetType === "evaluation" ? Evaluation : TwgAssessment;
    const row = await Model.findByPk(req.params.evaluationId, { transaction });
    if (!row) throw workflowError("Evaluation not found.", 404);
    const bid = await Bid.findByPk(row.bidId, { transaction });
    const rfq = await Rfq.findByPk(bid.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    await assertNoPendingFailure(rfq, { transaction });
    await row.reload({ transaction });
    if (rfq.status !== "opened" || row.status !== "submitted" || row.excludedForConflict) throw workflowError("Only an active submitted evaluation may be returned, before BAC finalization.");
    const evaluatorId = row.evaluatorId ?? row.memberId;
    if (evaluatorId === req.currentUser.id) throw workflowError("Another authorized BAC officer must return your evaluation for correction.", 403);
    const context = await assertBacAction(req, { transaction });
    const correction = await EvaluationReturn.create({ targetType, targetId: row.id, bidId: bid.id, evaluatorId, returnedById: req.currentUser.id, reason: req.body.reason.trim(), returnedAt: new Date(), previousSubmission: row.toJSON() }, { transaction });
    await row.update({ status: targetType === "evaluation" ? "returned" : "draft" }, { transaction });
    await audit(actorAudit(req, { actionType: "evaluation.returned", entityRef: targetType, entityId: row.id, summary: "Submitted evaluation returned for correction; the previous submission remains in the permanent history.", beforeState: correction.previousSubmission, afterState: { rfqId: rfq.id, correctionId: correction.id, reason: correction.reason, status: row.status, quorum: context.quorum, members: committeeSnapshot(context) } }));
    return correction;
  });
  res.json({ correction: result, message: "Evaluation returned for correction. The evaluator may submit a revised evaluation; the previous submission is preserved." });
};

export const getEvaluationAdministration = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id);
  if (!rfq) throw workflowError("Procurement not found.", 404);
  const bids = await Bid.findAll({ where: { rfqId: rfq.id }, attributes: ["id"] });
  const declarations = await EvaluatorDeclaration.findAll({ where: { rfqId: rfq.id }, include: [{ model: User, as: "user", attributes: ["id", "name"] }] });
  const returns = bids.length ? await EvaluationReturn.findAll({ where: { bidId: { [Op.in]: bids.map((bid) => bid.id) } }, include: [{ model: User, as: "returnedBy", attributes: ["id", "name"] }], order: [["returnedAt", "DESC"]] }) : [];
  let failureReviewPending = false;
  try { await assertNoPendingFailure(rfq); } catch (error) { if (error.name !== "ProcurementWorkflowError") throw error; failureReviewPending = true; }
  res.json({ declaration: declarations.find((row) => row.userId === req.currentUser.id) ?? null, conflicts: req.permissions.has("bidding.chairEvaluation") ? declarations.filter((row) => !row.noConflictDeclared) : [], returns, failureReviewPending });
};
