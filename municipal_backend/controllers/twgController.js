import { Op } from "sequelize";
import { Rfq, Bid } from "../models/biddingModel.js";
import { TwgDeclaration, TwgAssessment } from "../models/twgModel.js";
import { User } from "../models/userModel.js";
import { Document } from "../models/documentModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { actorAudit, workflowError } from "../services/workflowSupport.js";
import { requirementsError, TWG_RECOMMENDATIONS } from "../services/evaluationPolicy.js";

export const serializeAssessment = (row) => ({
  id: row.id, bidId: row.bidId, memberId: row.memberId, memberName: row.member?.name ?? null,
  requirements: row.requirements, recommendation: row.recommendation, remarks: row.remarks,
  supportingInformation: row.supportingInformation, status: row.status,
  noConflictDeclared: row.noConflictDeclared, declaredAt: row.declaredAt, submittedAt: row.submittedAt,
});

export const listTwg = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id);
  if (!rfq) throw workflowError("Procurement not found.", 404);
  const declaration = await TwgDeclaration.findOne({ where: { rfqId: rfq.id, memberId: req.currentUser.id } });
  const assessments = await TwgAssessment.findAll({
    where: { [Op.or]: [{ status: "submitted" }, { memberId: req.currentUser.id }] },
    include: [{ model: Bid, as: "bid", where: { rfqId: rfq.id }, attributes: ["id"] }, { model: User, as: "member", attributes: ["id", "name"] }],
    order: [["createdAt", "ASC"]],
  });
  res.json({ required: rfq.twgRequired, declaration: declaration ? { noConflictDeclared: declaration.noConflictDeclared, declaredAt: declaration.declaredAt } : null, assessments: assessments.map(serializeAssessment) });
};

export const declareTwgConflict = async (req, res) => {
  if (req.body.declared !== true) throw workflowError("Declare that you have no conflict of interest with any bidder participating in this procurement before evaluating.", 400);
  const declaration = await withAuditTransaction(async (transaction, audit) => {
    const rfq = await Rfq.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!rfq) throw workflowError("Procurement not found.", 404);
    if (rfq.status !== "opened") throw workflowError("TWG evaluation starts after bid opening.");
    const existing = await TwgDeclaration.findOne({ where: { rfqId: rfq.id, memberId: req.currentUser.id }, transaction });
    if (existing) return existing;
    const created = await TwgDeclaration.create({ rfqId: rfq.id, memberId: req.currentUser.id, noConflictDeclared: true, declaredAt: new Date() }, { transaction });
    await audit(actorAudit(req, { actionType: "twg.conflictDeclared", entityRef: "rfq", entityId: rfq.id, summary: "TWG member declared no conflict of interest with any participating bidder.", afterState: { rfqId: rfq.id, declarationId: created.id, noConflictDeclared: true, declaredAt: created.declaredAt } }));
    return created;
  });
  res.status(201).json({ noConflictDeclared: declaration.noConflictDeclared, declaredAt: declaration.declaredAt, message: "Conflict-of-interest declaration recorded. You may now prepare the TWG technical assessment." });
};

export const saveTwg = async (req, res) => {
  const { requirements = [], recommendation = null, remarks = "", supportingInformation = "", status = "draft" } = req.body;
  if (!["draft", "submitted"].includes(status)) throw workflowError("Choose draft or submitted for the TWG assessment.", 400);
  const final = status === "submitted";
  const error = requirementsError(requirements, { final });
  if (error) throw workflowError(error, 400);
  if (final && (!TWG_RECOMMENDATIONS.includes(recommendation) || typeof remarks !== "string" || !remarks.trim())) throw workflowError("A TWG recommendation and written justification are required before submission.", 400);
  const failed = requirements.some((row) => row.complianceStatus === "nonCompliant");
  if (final && failed && !["nonCompliant", "disqualification"].includes(recommendation)) throw workflowError("A non-compliant mandatory requirement requires a non-compliant or disqualification recommendation.", 400);
  const assessment = await withAuditTransaction(async (transaction, audit) => {
    const bid = await Bid.findByPk(req.params.bidId, { transaction });
    if (!bid) throw workflowError("Bid not found.", 404);
    const rfq = await Rfq.findByPk(bid.rfqId, { transaction, lock: transaction.LOCK.UPDATE });
    if (rfq.status !== "opened" || bid.status !== "opened") throw workflowError("TWG assessments may only be prepared during technical evaluation.");
    const declaration = await TwgDeclaration.findOne({ where: { rfqId: rfq.id, memberId: req.currentUser.id, noConflictDeclared: true }, transaction });
    if (!declaration) throw workflowError("Complete the conflict-of-interest declaration before participating in TWG evaluation.", 400);
    let row = await TwgAssessment.findOne({ where: { bidId: bid.id, memberId: req.currentUser.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (row?.status === "submitted") throw workflowError("Submitted TWG assessments are final and cannot be edited.");
    const before = row ? serializeAssessment(row) : null;
    const documentIds = requirements.flatMap((item) => Array.isArray(item.documents) ? item.documents.map((doc) => Number(typeof doc === "object" ? doc.id : doc)) : []);
    if (documentIds.length) {
      const documents = row ? await Document.findAll({ where: { id: { [Op.in]: documentIds }, entityRef: "twgAssessment", entityId: row.id }, attributes: ["id"], transaction }) : [];
      if (documents.length !== new Set(documentIds).size) throw workflowError("Supporting files must be uploaded to this TWG assessment before they can be referenced.", 400);
    }
    const values = { bidId: bid.id, memberId: req.currentUser.id, requirements, recommendation, remarks, supportingInformation, status, noConflictDeclared: true, declaredAt: declaration.declaredAt, submittedAt: final ? new Date() : null };
    row = row ? await row.update(values, { transaction }) : await TwgAssessment.create(values, { transaction });
    await audit(actorAudit(req, { actionType: final ? "twg.submitted" : "twg.draftSaved", entityRef: "twgAssessment", entityId: row.id, summary: final ? "TWG technical assessment and recommendation submitted for BAC review." : "TWG technical assessment saved as draft.", beforeState: before, afterState: { ...serializeAssessment(row), rfqId: rfq.id } }));
    return row;
  });
  res.status(201).json({ ...serializeAssessment(assessment), message: final ? "TWG technical evaluation successfully submitted. The evaluation is now available for BAC review." : "TWG evaluation saved as draft. You may continue editing before submitting it to the BAC." });
};
