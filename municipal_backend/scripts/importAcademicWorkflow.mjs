import "../config/env.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Op } from "sequelize";
import {
  sequelize, AppEntry, AipEntry, InvestmentProgram, DevelopmentGoal, Appropriation, Department, Role, User,
  PrHeader, PrLineItem, ProjectAllocation, BudgetControlRequest, Obligation, ProcurementMode, ProcurementAttempt,
  Rfq, Announcement, Vendor, Bid, BidOpeningRecord, Evaluation, EvaluatorDeclaration, PostQualification,
  BacResolution, Award, Contract, Delivery, Security, Invoice, Payment, Document, AuditLog,
} from "../models/index.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { attachIntegrityHooks } from "../services/integrityMonitor.js";
import { ACADEMIC_IMPORT_ACTION, ACADEMIC_PROJECT_KEY, CLIENT_STATUS_CONFIRMATION_ACTION } from "../services/academicCase.js";
import { announcementSchedule, scheduleValidationError } from "../services/procurementSchedulePolicy.js";
import { evaluationError, complianceRequirementsFor } from "../services/evaluationPolicy.js";
import { checksumOf, validateFileContent } from "../services/documentStore.js";
import { requiredPerformanceSecurity } from "../models/securityModel.js";
import { projectKeyFor } from "../services/procurementGovernance.js";
import * as c from "./academicWorkflowData.mjs";
import { documents } from "./academicWorkflowDocuments.mjs";

const existingProjects = new Map([
  [38, "2026:MDRRMO-2026-001"],
  [45, "form-2025:GSO-2025-001"],
  [46, "form-2025:MICTO-2025-002"],
  [47, "form-2025:MEO-2025-003"],
]);
const modeKey = "competitiveBidding";
const manilaDate = (date) => new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeZone: "Asia/Manila" }).format(date);
const completedAt = c.dates.paid;
const contractTerms = "Deliver, assemble, level and anchor the equipment in the municipal records room within " + c.contractDays + " calendar days of notice to proceed. Full payment after inspection, acceptance and invoice certification. One-year workmanship warranty from acceptance.";

async function confirmExistingStatuses(transaction, audit, importedAt) {
  const projects = await AppEntry.findAll({
    where: { id: { [Op.in]: [...existingProjects.keys()] } },
    order: [["id", "ASC"]], transaction, lock: transaction.LOCK.UPDATE,
  });
  assert.equal(projects.length, existingProjects.size, "The original four client projects must exist.");
  const updated = [];
  for (const project of projects) {
    assert.equal(project.recoveryKey, existingProjects.get(project.id), "Client project identity differs from the reviewed record.");
    const recovery = project.recoveryImport;
    assert.ok(recovery && typeof recovery === "object", "Original source provenance is required.");
    if (recovery.displayStatusConfirmation?.category === "ongoing") continue;
    const confirmation = { category: "ongoing", source: "Client confirmation supplied by the project owner", recordedAt: importedAt.toISOString() };
    // This changes only the display classification. The source forms and the
    // actual plans, awards and related records keep their own statuses.
    await project.update({ recoveryImport: { ...recovery, displayStatusConfirmation: confirmation } }, { transaction, hooks: false });
    await audit({
      actionType: CLIENT_STATUS_CONFIRMATION_ACTION, entityRef: "appEntry", entityId: project.id,
      actorRole: "system", summary: "Client confirmation of ongoing project display recorded.",
      beforeState: { displayStatusConfirmation: recovery.displayStatusConfirmation ?? null },
      afterState: { displayStatusConfirmation: confirmation, workflowStatus: project.status, recoveryKey: project.recoveryKey },
    });
    updated.push(project.id);
  }
  return updated;
}

async function references(transaction) {
  const department = await Department.findOne({ where: { code: "GSO", status: "active" }, transaction });
  const program = await InvestmentProgram.findOne({ where: { fiscalYear: c.year, status: "adopted" }, transaction });
  const mode = await ProcurementMode.findOne({ where: { key: modeKey }, transaction });
  assert.ok(department && program && mode, "The existing GSO, approved 2026 investment program and procurement mode are required.");
  const goal = await DevelopmentGoal.findOne({
    where: { developmentPlanId: program.developmentPlanId, sector: "institutional", status: "active" },
    order: [["id", "ASC"]], transaction,
  });
  assert.ok(goal, "The adopted plan must have an institutional development goal.");
  const users = await User.findAll({ include: [Role], order: [["id", "ASC"]], transaction });
  const officers = new Map();
  for (const user of users) if (user.Role && !officers.has(user.Role.key)) officers.set(user.Role.key, user.id);
  const role = (key) => {
    const officer = officers.get(key);
    assert.ok(officer, "Missing workflow role " + key);
    return officer;
  };
  const secretariatEmail = users.find((user) => user.id === role("bacSecretariat"))?.email;
  return { department, program, mode, goal, role, secretariatEmail };
}

async function addPlan({ department, program, mode, goal, role }, transaction) {
  const existing = await AppEntry.findOne({ where: { [Op.or]: [{ papCode: c.papCode }, { projectTitle: c.title }] }, transaction });
  assert.equal(existing, null, "A planning line already uses the case title or reference.");
  const aip = await AipEntry.create({
    reference: c.aipReference, title: "Municipal Records Room Storage Improvement", description: c.purpose,
    expectedOutput: c.expectedOutput, expenseClass: c.expenseClass, fund: "generalFund", papCode: c.papCode,
    estimatedCost: c.abc, startQuarter: "Q3", endQuarter: "Q4", status: "planned",
    remarks: "Supplemental AIP entry under the municipal records management program.",
    investmentProgramId: program.id, developmentGoalId: goal.id, implementingUnitId: department.id,
  }, { transaction });
  const appropriation = await Appropriation.create({
    fiscalYear: c.year, ordinanceNo: c.ordinance, ordinanceDate: manilaDate(c.dates.ordinance),
    type: "supplemental", fund: "generalFund", expenseClass: c.expenseClass, papCode: c.papCode,
    title: aip.title, amount: c.abc, status: "enacted", departmentId: department.id,
    remarks: "Funding for the cabinets, adjustable shelving and installation specified in " + c.aipReference + ".",
  }, { transaction });
  const appEntry = await AppEntry.create({
    recoveryKey: ACADEMIC_PROJECT_KEY, projectTitle: c.title, description: c.purpose,
    papCode: c.papCode, category: "Goods", categoryDetails: "Semi-expendable records storage furniture and fixtures",
    procurementMode: mode.key, abc: c.abc, unit: "lot", quantity: 1, fundSource: c.fundingLabel,
    targetStartQuarter: "Q3", targetCompletionQuarter: "Q4", justificationStatus: "notApplicable",
    fiscalYear: c.year, status: "locked", planStage: "finalApp", planCycle: "final", earlyProcurement: false,
    bidEvaluationCriteria: "Pass/fail technical compliance, followed by the lowest calculated responsive bid.",
    procurementStrategy: "One lot, including delivery, assembly and anchoring in the records room.",
    modeRecommendedAt: c.dates.planRecommended, modeRecommendationBasis: "Competitive supply market for standard storage fixtures.",
    lockedAt: c.dates.plan, postedAt: c.dates.planPosted, gppbSubmittedAt: c.dates.planPosted,
    implementingUnitId: department.id, appropriationId: appropriation.id, aipEntryId: aip.id,
  }, { transaction });
  const allocationApproval = await BudgetControlRequest.create({
    kind: "allocation", status: "approved", sourceProjectId: appEntry.id, sourceAppropriationId: appropriation.id,
    fiscalYear: c.year, amount: c.abc, fund: "generalFund", expenseClass: c.expenseClass,
    reason: "Reserve the supplemental appropriation for the approved procurement plan.", authorityReference: c.ordinance,
    requesterId: role("budgetOfficer"), approverId: role("hope"),
    requestedAt: c.dates.allocationRequested, approvedAt: c.dates.allocation,
  }, { transaction });
  const allocation = await ProjectAllocation.create({
    appEntryId: appEntry.id, appropriationId: appropriation.id, fiscalYear: c.year,
    amount: c.abc, status: "closed", approvedById: role("hope"), approvedAt: c.dates.allocation,
    sourceRequestId: allocationApproval.id,
  }, { transaction });
  const pr = await PrHeader.create({
    prNumber: c.prNumber, purpose: c.purpose, dateRequired: c.deadline,
    isEmergency: false, justificationStatus: "notApplicable", totalAmount: c.abc, status: "approved",
    appropriationCertifiedAt: c.dates.appropriated, fundsReservedAt: c.dates.obligated,
    cashCertifiedAt: c.dates.cashCertified, mayorApprovedAt: c.dates.requisitionApproved,
    fundSource: "generalFund", modeDeterminedAt: c.dates.mode, modeJustificationStatus: "notApplicable",
    suggestedModeKey: mode.key, submittedAt: c.dates.requested,
    appEntryId: appEntry.id, departmentId: department.id, procurementModeId: mode.id,
  }, { transaction });
  await PrLineItem.bulkCreate(c.items.map(({ offeredUnitCost, ...item }) => ({
    ...item, lineTotal: item.quantity * item.unitCost, hasUsefulLifeOverOneYear: true,
    assetClass: "semiExpendable", prHeaderId: pr.id,
  })), { transaction });
  const obligation = await Obligation.create({
    obligationNo: c.obligationNo, amount: c.awardAmount, status: "obligated", certifiedAt: c.dates.obligated,
    particulars: "Funds reserved for " + c.prNumber + " and conformed to " + c.purchaseOrder + " upon award.",
    appropriationId: appropriation.id, prHeaderId: pr.id,
  }, { transaction });
  return { aip, appropriation, appEntry, allocationApproval, allocation, pr, obligation };
}

async function addBidding(plan, { mode, role, secretariatEmail }, transaction) {
  const rfqFields = {
    referenceNo: c.solicitation, title: c.title, openingVenue: c.venue, category: "goods", abc: c.abc,
    prHeaderId: plan.pr.id, appEntryId: plan.appEntry.id, procurementModeId: mode.id, status: "awarded",
    procurementContactPerson: "BAC Secretariat", procurementContactEmail: secretariatEmail,
    requiredSupplierDocuments: "PhilGEPS eligibility, signed bid securing declaration, technical compliance schedule and separate financial offer.",
    publishDate: c.dates.posted, procurementStartAt: c.dates.schedule, publicationStartAt: c.dates.posted,
    publicationEndAt: c.dates.closes, closingDate: c.dates.closes, openingDate: c.dates.opened,
    prebidRequired: true, prebidAt: c.dates.prebid, prebidVenue: c.venue,
    prebidRemarks: "Confirmed working-load rating, installation method and acceptance checklist.",
    evaluationStartAt: c.dates.technical, evaluationEndAt: c.dates.financial,
    postQualificationStartAt: c.dates.qualificationStart, postQualificationEndAt: c.dates.qualification,
    expectedAwardAt: c.dates.award, scheduleApprovedAt: c.dates.schedule, schedulePublishedAt: c.dates.posted,
    twgRequired: false, postingRequired: true, philgepsPostedAt: c.dates.posted, philgepsReference: "PH-" + c.solicitation,
  };
  assert.equal(scheduleValidationError(rfqFields), null);
  const rfq = await Rfq.create(rfqFields, { transaction });
  const notice = await Announcement.create({
    ...announcementSchedule(rfq),
    title: "Invitation to Bid · " + c.title, body: "Supply, delivery, assembly and anchoring of 12 filing cabinets and 10 records racks for the General Services Office.",
    category: "procurementOpportunity", status: "archived", publishedAt: c.dates.posted, expiresAt: c.dates.closes,
    archivedAt: c.dates.financial, registrationDeadline: c.dates.closes, venue: c.venue,
    fundSource: c.fundingLabel, procurementMethod: mode.name, rfqId: rfq.id, appEntryId: plan.appEntry.id,
  }, { transaction });
  const bids = [], vendors = [];
  const evaluatorRoles = ["bacMember", "bacViceChairperson"];
  for (const key of evaluatorRoles) {
    await EvaluatorDeclaration.create({ rfqId: rfq.id, userId: role(key), role: key, noConflictDeclared: true, declaredAt: c.dates.opened }, { transaction });
  }
  const compliance = Object.fromEntries(complianceRequirementsFor("goods", modeKey).map(({ key }) => [key, true]));
  assert.equal(evaluationError({ category: "goods", modeKey, criteriaBreakdown: compliance, verdict: "passed" }), null);
  for (const [index, supplier] of c.bidders.entries()) {
    const vendor = await Vendor.create({
      businessName: supplier.businessName, referenceCode: "VR-2026-" + supplier.code,
      organizationType: "soleProprietorship", address: supplier.address, contactEmail: supplier.email,
      philgepsRegistrationNo: "VR-26-" + supplier.code + "-031", philgepsExpiry: "2026-12-31",
      registrationStatus: "verified", receivedAt: c.dates.posted, reviewedAt: c.dates.prebid,
      isVatRegistered: supplier.isVatRegistered, taxClassification: "goods",
    }, { transaction });
    vendors.push(vendor);
    const bid = await Bid.create({
      rfqId: rfq.id, vendorId: vendor.id, submittedAt: supplier.submittedAt, blindLabel: "Bidder " + String.fromCharCode(65 + index),
      technicalSubmitted: true, financialSealed: false, totalBidPrice: supplier.amount,
      status: index === 0 ? "awarded" : "lost",
    }, { transaction });
    bids.push(bid);
    await Security.create({
      type: "bid", form: "securingDeclaration", amount: 0, percentage: 0, referenceNo: "BSD-" + supplier.code + "-031",
      postedAt: supplier.submittedAt, validUntil: "2026-12-17", status: "released", releasedAt: c.dates.signedVendor,
      entityRef: "bid", entityId: bid.id, vendorId: vendor.id,
    }, { transaction });
    for (const key of evaluatorRoles) {
      await Evaluation.create({
        bidId: bid.id, evaluatorId: role(key), criteriaBreakdown: compliance, score: 100,
        noConflictDeclared: true, declaredAt: c.dates.opened, submittedAt: c.dates.technical,
        blindFlag: true, status: "submitted", recommendation: "Technically responsive",
        remarks: "Eligibility documents, product data sheets, delivery terms and bid security checked.",
      }, { transaction });
    }
  }
  const opening = await BidOpeningRecord.create({
    rfqId: rfq.id, openedAt: c.dates.opened, bidsReceived: bids.length,
    witnesses: "BAC Secretariat, BAC members and supplier representatives",
    remarks: "Three timely submissions counted. Technical envelopes released for evaluation; prices remained sealed until technical compliance was established.",
  }, { transaction });
  const qualification = await PostQualification.create({
    bidId: bids[0].id, result: "passed", verifiedAt: c.dates.qualification,
    checklist: { philgeps: "verified", permit: "verified", technical: "compliant", delivery: "confirmed", warranty: "confirmed" },
    remarks: "Original eligibility documents, technical data, installation schedule and one-year warranty verified.",
  }, { transaction });
  const award = await Award.create({
    rfqId: rfq.id, bidId: bids[0].id, vendorId: vendors[0].id, status: "accepted", awardBasis: "LCRB",
    noaNumber: c.noticeOfAward, noaDate: manilaDate(c.dates.award), supplierReceivedAt: c.dates.awardReceipt,
    amount: c.awardAmount, remarks: "Supplier acknowledged the Notice of Award and complied with the performance security requirement.",
  }, { transaction });
  const resolution = await BacResolution.create({
    resolutionNo: c.bacResolution, type: "recommendAward", title: "Resolution recommending award of " + c.solicitation,
    recitals: "Three responsive offers. " + c.winner.businessName + " submitted the lowest calculated bid and passed post-qualification.",
    resolvedAt: c.dates.resolution,
    members: [["bacChairperson", "BAC Chairperson"], ["bacViceChairperson", "BAC Vice-Chairperson"], ["bacMember", "BAC Member"]]
      .map(([key, name]) => ({ userId: role(key), role: key, name, present: true, concurred: true })),
    quorumMet: true, entityRef: "award", entityId: award.id,
  }, { transaction });
  const attempt = await ProcurementAttempt.create({
    rfqId: rfq.id, projectKey: projectKeyFor(rfq), attemptNumber: 1, status: "awarded",
    bacResolutionId: resolution.id, startedAt: c.dates.schedule, completedAt: c.dates.award,
    outcomeSnapshot: { awardId: award.id, winningBidId: bids[0].id, amount: c.awardAmount, basis: "LCRB" },
  }, { transaction });
  return { rfq, notice, bids, vendors, opening, qualification, resolution, award, attempt };
}

async function addSettlement(plan, bidding, { role }, transaction) {
  const vendorId = bidding.vendors[0].id;
  const contract = await Contract.create({
    awardId: bidding.award.id, vendorId, contractNo: c.contractNo, poRef: c.purchaseOrder,
    amount: c.awardAmount, amountPaid: c.awardAmount, instrumentType: "purchaseOrder", category: "goods",
    startDate: manilaDate(c.dates.proceeds), deliveryDeadline: c.deadline, noticeToProceedAt: c.dates.proceeds,
    contractDays: c.contractDays, signedByLguAt: c.dates.signedLgu, signedByVendorAt: c.dates.signedVendor,
    status: "completed", actualCompletionAt: completedAt, terms: contractTerms,
  }, { transaction });
  const security = await Security.create({
    type: "performance", form: "managersCheck", amount: requiredPerformanceSecurity(c.awardAmount, "goods", "managersCheck"),
    percentage: 5, referenceNo: "PS-2026-031", postedAt: c.dates.secured, validUntil: "2027-02-28",
    status: "released", releasedAt: c.dates.inspected,
    entityRef: "contract", entityId: contract.id, vendorId,
  }, { transaction });
  const delivery = await Delivery.create({
    contractId: contract.id, deliveredAt: c.dates.delivered, inspectedAt: c.dates.inspected, status: "accepted",
    description: c.deliveryReceipt + " · Filing cabinets and records racks installed in the municipal records room.",
    acceptedQuantityNote: "12 cabinets and 10 assembled and anchored racks accepted in full.",
    acceptedValue: c.awardAmount, remarks: c.acceptanceReport + " · Property tags entered and all locks and anchors checked.",
  }, { transaction });
  const invoice = await Invoice.create({
    contractId: contract.id, deliveryId: delivery.id, vendorId, invoiceNo: c.invoiceNo, supplierInvoiceRef: c.supplierInvoice,
    amount: c.awardAmount, submittedAt: c.dates.invoiced, status: "paid",
    remarks: "Certified against " + c.purchaseOrder + " and " + c.acceptanceReport + ".",
  }, { transaction });
  const { breakdown, netAmount, grossAmount, ewtAmount, vatWithheldAmount, retentionAmount, liquidatedDamages, otherDeductions } = c.deductions;
  const payment = await Payment.create({
    invoiceId: invoice.id, disbursementNo: c.voucher, amount: netAmount, grossAmount, ewtAmount, vatWithheldAmount,
    retentionAmount, liquidatedDamages, otherDeductions, deductionBreakdown: breakdown,
    preparedAt: c.dates.certified, releasedAt: c.dates.paid, status: "released", method: "bankTransfer",
    reference: c.paymentReference, remarks: "Full supplier settlement against the certified invoice. Withholding recorded on the voucher.",
  }, { transaction });
  const closeout = await BudgetControlRequest.create({
    kind: "closeout", status: "approved", sourceProjectId: plan.appEntry.id, sourceAppropriationId: plan.appropriation.id,
    fiscalYear: c.year, amount: c.savings, classification: "contractSavings", fund: "generalFund", expenseClass: c.expenseClass,
    sector: "institutional", reason: "Final acceptance and disbursement verified. Recognize the unused portion of the project allocation.",
    authorityReference: c.closeoutReference, requesterId: role("budgetOfficer"), approverId: role("hope"),
    requestedAt: c.dates.closeoutRequested, approvedAt: c.dates.closed,
    decisionRemarks: "No unpaid supplier balance. Tax liabilities remain separately recorded on " + c.voucher + ".",
  }, { transaction });
  return { contract, security, delivery, invoice, payment, closeout };
}

async function loadAttachments(directory) {
  return Promise.all(documents.map(async (spec) => {
    const content = await readFile(join(directory, spec.filename));
    const mimeType = "application/pdf";
    assert.equal(validateFileContent({ buffer: content, mimetype: mimeType }), null, "Invalid PDF " + spec.filename);
    return { ...spec, content, mimeType, checksum: checksumOf(content) };
  }));
}

async function addAttachments(plan, bidding, settlement, files, importedAt, transaction) {
  const owners = { ...plan, ...bidding, ...settlement };
  const ids = new Map();
  for (const file of files) {
    const bidIndex = /^bid([0-9]+)$/.exec(file.entityRef);
    const entityRef = bidIndex ? "bid" : file.entityRef;
    const owner = bidIndex ? bidding.bids[Number(bidIndex[1])] : owners[entityRef];
    assert.ok(owner?.id, "Missing document owner " + file.entityRef);
    const { id } = await Document.create({
      entityRef, entityId: owner.id, filename: file.filename, label: file.title, docType: "supportingRecord",
      mimeType: file.mimeType, sizeBytes: file.content.length, checksum: file.checksum, content: file.content,
      uploadedAt: importedAt,
    }, { transaction });
    ids.set(file.reference, id);
  }
  await plan.allocationApproval.update({ supportingDocumentIds: [ids.get(c.ordinance)] }, { transaction });
  await bidding.attempt.update({ supportingDocuments: [ids.get(c.solicitation), ids.get(c.solicitation + "-AB"), ids.get(c.bacResolution)] }, { transaction });
  await settlement.closeout.update({ supportingDocumentIds: [ids.get(c.acceptanceReport), ids.get(c.voucher), ids.get(c.closeoutReference)] }, { transaction });
  return ids;
}

const [target, directory, operation] = process.argv.slice(2);
assert.ok(target && directory && operation === "--apply", "Usage: node scripts/importAcademicWorkflow.mjs <database> <pdf-directory> --apply");
assert.equal(sequelize.config.database, target, "The requested database does not match the configured connection.");
assert.ok(["127.0.0.1", "localhost"].includes(sequelize.config.host), "Run this importer on the database host.");

try {
  const files = await loadAttachments(directory);
  await sequelize.authenticate();
  await attachIntegrityHooks();
  const result = await withAuditTransaction(async (transaction, audit) => {
    const importedAt = new Date();
    const updated = await confirmExistingStatuses(transaction, audit, importedAt);
    const existing = await AppEntry.findOne({ where: { recoveryKey: ACADEMIC_PROJECT_KEY }, transaction });
    if (existing) {
      assert.equal(existing.projectTitle, c.title, "An existing project owns the case reference.");
      const receipt = await AuditLog.findOne({ where: { actionType: ACADEMIC_IMPORT_ACTION, entityRef: "appEntry", entityId: existing.id }, transaction });
      assert.ok(receipt, "An existing case has no import receipt.");
      return { projectId: existing.id, status: "alreadyImported", updated };
    }
    const refs = await references(transaction);
    const plan = await addPlan(refs, transaction);
    const bidding = await addBidding(plan, refs, transaction);
    const settlement = await addSettlement(plan, bidding, refs, transaction);
    const filesByReference = await addAttachments(plan, bidding, settlement, files, importedAt, transaction);
    const identity = { projectId: plan.appEntry.id, prId: plan.pr.id, rfqId: bidding.rfq.id, awardId: bidding.award.id, contractId: settlement.contract.id, paymentId: settlement.payment.id };
    await audit({
      actionType: ACADEMIC_IMPORT_ACTION, entityRef: "appEntry", entityId: plan.appEntry.id,
      actorRole: "system", summary: "Imported completed procurement records for the approved private academic case.",
      afterState: {
        origin: "syntheticAcademicCase", recordedStatus: "completed", key: ACADEMIC_PROJECT_KEY,
        importedAt: importedAt.toISOString(), historicalUserActionsCreated: false,
        documentCount: filesByReference.size, links: identity, businessMilestones: c.milestones,
      },
    });
    return { ...identity, status: "imported", updated, documents: filesByReference.size };
  });
  console.log(JSON.stringify(result));
} finally {
  await sequelize.close();
}
