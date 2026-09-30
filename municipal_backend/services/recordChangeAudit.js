import { AsyncLocalStorage } from "node:async_hooks";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { auditFromRequest, redactSecrets } from "./auditLog.js";

const context = new AsyncLocalStorage();
// Business records share one detailed history policy. Authentication secrets,
// session storage, notifications, audit internals and receipt caches are excluded.
const entities = {
  DevelopmentPlan: "developmentPlan", DevelopmentGoal: "developmentGoal", InvestmentProgram: "investmentProgram", AipEntry: "aipEntry",
  ExecutiveBudget: "executiveBudget", BudgetProposal: "budgetProposal", BudgetProposalLine: "budgetProposalLine", BudgetProceeding: "budgetProceeding",
  AppEntry: "appEntry", PrHeader: "purchaseRequisition", PrLineItem: "prLineItem", Appropriation: "appropriation", Obligation: "obligation",
  ProjectAllocation: "projectAllocation", BudgetControlRequest: "budgetControlRequest",
  Rfq: "rfq", Bid: "bid", BidOpeningRecord: "bidOpeningRecord", Evaluation: "evaluation", PostQualification: "postQualification", Award: "award",
  EvaluationPlan: "evaluationPlan", EvaluatorDeclaration: "evaluatorDeclaration", EvaluationReturn: "evaluationReturn", EvaluationCriteriaAmendment: "evaluationCriteriaAmendment",
  TwgAssessment: "twgAssessment", TwgDeclaration: "twgDeclaration", ScheduleAmendment: "scheduleAmendment", ProcurementAttempt: "procurementAttempt", FailureRecord: "failureRecord", BacDecisionVote: "bacDecisionVote", NegotiatedReview: "negotiatedReview", BacResolution: "bacResolution",
  Contract: "contract", Delivery: "delivery", Invoice: "invoice", Payment: "payment", Security: "security", PendingItem: "pendingItem",
  Announcement: "announcement", LiveConferenceSession: "conference", ConferenceAttendance: "conferenceAttendance", Department: "department", Vendor: "vendor", VendorDocument: "vendorDocument",
  ObserverOrganization: "observerOrganization", ObserverInvitation: "observerInvitation", ObservationReport: "observationReport", Protest: "protest",
  DocumentTemplate: "documentTemplate", DocumentTemplateVersion: "documentTemplateVersion", GeneratedDocument: "generatedDocument", Document: "document",
  PublicMessage: "publicMessage", ProcurementLimit: "procurementLimit",
};
const previous = Symbol("recordAuditPrevious");
const bulkPrevious = Symbol("recordAuditBulkPrevious");
const snapshot = (Model, values) => redactSecrets(Object.fromEntries(Object.entries(Model.getAttributes())
  .filter(([key, attribute]) => !["createdAt", "updatedAt"].includes(key) && attribute.type?.key !== "BLOB")
  .map(([key]) => [key, values?.[key] ?? null])));
const modelOf = row => row?.constructor;
const active = Model => !!context.getStore()?.currentUser?.id && !!entities[Model?.name];
const clone = value => JSON.parse(JSON.stringify(value));
const record = async (Model, id, action, beforeState, afterState, options) => {
  if (!active(Model)) return;
  if (action === "updated" && JSON.stringify(beforeState) === JSON.stringify(afterState)) return;
  const req = context.getStore();
  await auditFromRequest(req, {
    actionType: `record.${action}`, entityRef: entities[Model.name], entityId: id,
    summary: `${Model.name} #${id} ${action}.`, beforeState, afterState,
  }, { transaction: options?.transaction, strict: true });
};

let attached = false;
export const attachRecordChangeAudit = () => {
  if (attached) return;
  attached = true;
  sequelize.addHook("beforeUpdate", "recordHistory", row => {
    const Model = modelOf(row);
    if (active(Model)) row[previous] = clone(snapshot(Model, row._previousDataValues));
  });
  sequelize.addHook("afterCreate", "recordHistory", (row, options) => record(modelOf(row), row.get(row.constructor.primaryKeyAttribute), "created", null, snapshot(modelOf(row), row.dataValues), options));
  sequelize.addHook("afterUpdate", "recordHistory", (row, options) => record(modelOf(row), row.get(row.constructor.primaryKeyAttribute), "updated", row[previous] ?? snapshot(modelOf(row), row._previousDataValues), snapshot(modelOf(row), row.dataValues), options));
  sequelize.addHook("beforeDestroy", "recordHistory", row => { if (active(modelOf(row))) row[previous] = clone(snapshot(modelOf(row), row.dataValues)); });
  sequelize.addHook("afterDestroy", "recordHistory", (row, options) => record(modelOf(row), row.get(row.constructor.primaryKeyAttribute), "deleted", row[previous] ?? snapshot(modelOf(row), row.dataValues), null, options));
  sequelize.addHook("afterBulkCreate", "recordHistory", async (rows, options) => {
    if (options.individualHooks) return;
    for (const row of rows) await record(modelOf(row), row.get(row.constructor.primaryKeyAttribute), "created", null, snapshot(modelOf(row), row.dataValues), options);
  });
  const beforeBulk = async options => {
    if (options.individualHooks || !active(options.model)) return;
    const rows = await options.model.findAll({ where: options.where, transaction: options.transaction, ...(options.transaction ? { lock: options.transaction.LOCK.UPDATE } : {}) });
    options[bulkPrevious] = rows.map(row => ({ id: row.get(options.model.primaryKeyAttribute), state: clone(snapshot(options.model, row.dataValues)) }));
  };
  sequelize.addHook("beforeBulkUpdate", "recordHistory", beforeBulk);
  sequelize.addHook("beforeBulkDestroy", "recordHistory", beforeBulk);
  sequelize.addHook("afterBulkUpdate", "recordHistory", async options => {
    if (!options[bulkPrevious]?.length) return;
    const Model = options.model;
    const rows = await Model.findAll({ where: { [Model.primaryKeyAttribute]: { [Op.in]: options[bulkPrevious].map(row => row.id) } }, transaction: options.transaction });
    for (const row of rows) await record(Model, row.get(Model.primaryKeyAttribute), "updated", options[bulkPrevious].find(old => old.id === row.get(Model.primaryKeyAttribute))?.state, snapshot(Model, row.dataValues), options);
  });
  sequelize.addHook("afterBulkDestroy", "recordHistory", async options => {
    for (const row of options[bulkPrevious] ?? []) await record(options.model, row.id, "deleted", row.state, null, options);
  });
};

export const withRecordChangeAudit = (req, work) => context.run(req, work);
