import "../config/env.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  sequelize, AppEntry, PrHeader, PrLineItem, Appropriation, Obligation,
  ProcurementMode, Rfq, Vendor, Bid, BidOpeningRecord, Document,
} from "../models/index.js";
import { RecordFingerprint } from "../models/integrityModel.js";
import { ProjectAllocation } from "../models/budgetControlModel.js";
import { fingerprintOf } from "../services/integrityMonitor.js";
import { verifyChain, withAuditTransaction } from "../services/auditLog.js";
import { getPublicProject } from "../services/projectLifecycle.js";
import { scheduleValidationError } from "../services/procurementSchedulePolicy.js";

const at = (value) => new Date(`2026-${value}:00+08:00`);
const events = [
  ["10-15T09:18", "planning", "Scope and quantities reviewed", "MDRRMO", "Complete", "Confirmed one equipment lot and the PHP 1.5 million planning ceiling."],
  ["10-15T14:42", "planning", "Funding and plan line linked", "Budget Office", "Complete", "Linked the test appropriation to the annual procurement plan line."],
  ["10-16T08:47", "requisition", "Purchase request submitted", "MDRRMO", "Complete", "Submitted the item specifications for review."],
  ["10-16T11:26", "requisition", "Purchase request endorsed", "Department Head", "Complete", "Checked the equipment list against the department's emergency response requirements."],
  ["10-16T15:08", "requisition", "Cash availability certified", "Treasurer", "Complete", "Checked the requisition against the test funding allocation."],
  ["10-19T09:36", "requisition", "Purchase request approved", "Mayor", "Complete", "Approved the request to proceed to appropriation certification."],
  ["10-19T13:51", "requisition", "Appropriation certified", "Budget Office", "Complete", "Matched the request to the test disaster response appropriation."],
  ["10-19T16:07", "requisition", "Obligation recorded", "Accountant", "Complete", "Reserved PHP 1.5 million against the test appropriation."],
  ["10-20T09:12", "solicitation", "Competitive bidding selected", "BAC", "Complete", "Cleared the requisition and confirmed public bidding."],
  ["10-20T11:23", "solicitation", "Solicitation schedule reviewed", "BAC Chair", "Complete", "Confirmed the conference, submission deadline and bid opening schedule."],
  ["10-20T14:16", "solicitation", "Invitation to Bid posted", "BAC Secretariat", "Complete", "Opened the demonstration solicitation and made the equipment requirements available."],
  ["10-22T10:00", "solicitation", "Pre-bid conference held", "BAC Secretariat", "Complete", "Reviewed the equipment specifications and explained the document submission requirements."],
  ["10-27T14:33", "solicitation", "Supplier inquiry answered", "BAC Secretariat", "Complete", "Confirmed that unit counts should appear on the equipment breakdown. The schedule and lot scope stayed as posted."],
  ["11-04T14:11", "bidding", "Test bid received", "Test supplier", "Complete", "Logged the submission before the deadline. The financial envelope stayed sealed."],
  ["11-05T10:00", "bidding", "Bid submissions closed", "BAC Secretariat", "Complete", "Closed intake with one test submission on file."],
  ["11-05T10:30", "bidding", "Bid opening recorded", "BAC", "Complete", "Opened the technical submission and logged the bid for review."],
  ["11-06T09:24", "evaluation", "Technical review started", "Technical Working Group", "In progress", "Checking the bid against the equipment specification sheet. The financial envelope remains sealed."],
  ["11-06T15:37", "evaluation", "Technical checklist awaiting sign-off", "Technical Working Group", "Pending", "Complete the compliance checklist and confirm the result before opening the financial envelope."],
  ["11-06T16:14", "evaluation", "Post-qualification queued", "BAC", "Pending", "Begin verification after evaluation. The requested November 6 need-by date has passed without delivery, so MDRRMO must confirm a revised target."],
].map(([date, stage, action, role, status, detail]) => ({
  occurredAt: at(date).toISOString(), stage, action, role, status, detail,
}));

try {
  assert.equal(process.env.NODE_ENV, "development");
  assert.equal(sequelize.config.host, "127.0.0.1");
  assert.equal(sequelize.config.database, "municipal_ongoing_demo_20261106");
  const baseline = await verifyChain();
  const ids = await withAuditTransaction(async (transaction, audit) => {
    const options = { transaction };
    const app = await AppEntry.findOne({ where: { recoveryKey: "2026:MDRRMO-2026-001" }, ...options, lock: transaction.LOCK.UPDATE });
    assert.ok(app);
    const existingScenario = app.recoveryImport.ongoingScenario;
    const pr = await PrHeader.findOne({ where: { appEntryId: app.id }, ...options });
    assert.ok(pr);
    assert.equal(await PrLineItem.count({ where: { prHeaderId: pr.id }, ...options }), 1);
    const item = await PrLineItem.findOne({ where: { prHeaderId: pr.id }, ...options });
    const mode = await ProcurementMode.findOne({ where: { key: "competitiveBidding" }, ...options });
    const amount = Number(app.abc);
    assert.equal(amount, 1500000);

    const source = {
      ...Object.fromEntries(app.recoveryImport.sourceFields.map(({ label, value }) => [label, value])),
      "Technical Specifications": "Portable generator sets, rescue ropes, life jackets, emergency lights, first-aid kits, handheld radios, tarpaulins and other approved emergency response equipment.",
      "Bid Opening / Conference Venue": "Mayor’s Conference Hall",
      "Required Supplier Documents": "PhilGEPS registration, business permit, Omnibus Sworn Statement, bid security, technical specifications, financial proposal and applicable bidding documents.",
      "Supplier Category": "Emergency and Disaster Response Equipment",
      Status: "Awarded / For implementation",
    };
    const importedAt = new Date().toISOString();
    const provenance = { kind: "local-test-scenario", source: "Procurement_Information_Form_New_Project_2026.docx", importedAt, projectCode: app.papCode };
    const snapshot = (row) => {
      const values = row.get({ plain: true });
      const { content, recoveryImport, ...record } = values;
      return record;
    };
    const writeAudit = async (entityRef, row, beforeState = null, extra = {}) => audit({
      actionType: "data.demo.ongoing.import", entityRef, entityId: row.id, actorName: "Local demonstration import", actorRole: "system",
      summary: `Imported October–November 2026 test scenario for ${app.papCode} (${entityRef} #${row.id})`,
      beforeState, afterState: { record: snapshot(row), provenance, ...extra },
    });
    const create = async (model, entityRef, data) => {
      const row = await model.create(data, options);
      await writeAudit(entityRef, row);
      return row;
    };
    const update = async (entityRef, row, data, extra) => {
      const previous = snapshot(row);
      await row.update(data, options);
      const entry = await writeAudit(entityRef, row, previous, extra);
      const fingerprint = await RecordFingerprint.findOne({ where: { entityRef, entityId: row.id }, ...options });
      if (fingerprint) {
        await fingerprint.update({ fingerprint: fingerprintOf(entityRef, row), lastAuditSequence: entry.sequence }, options);
      }
    };
    const ensureAllocation = async () => {
      const existing = await ProjectAllocation.findOne({ where: { appEntryId: app.id }, ...options });
      if (existing) {
        assert.equal(existing.appropriationId, app.appropriationId);
        assert.equal(Number(existing.amount), amount);
        return;
      }
      const obligation = await Obligation.findOne({ where: { prHeaderId: pr.id, appropriationId: app.appropriationId }, ...options });
      assert.equal(Number(obligation?.amount), amount);
      await create(ProjectAllocation, "projectAllocation", {
        appEntryId: app.id, appropriationId: app.appropriationId, fiscalYear: app.fiscalYear,
        amount, origin: "legacyObligation", approvedAt: at("10-15T14:42"),
      });
    };
    if (existingScenario) {
      await ensureAllocation();
      return { appId: app.id, reusedScenario: true };
    }
    assert.equal(app.status, "draft");
    assert.equal(pr.status, "draft");
    assert.equal(await Rfq.count({ where: { appEntryId: app.id }, ...options }), 0);

    const appropriation = await create(Appropriation, "appropriation", {
      fiscalYear: 2026, ordinanceNo: "DEMO-BUDGET-2026-MDRRMO", ordinanceDate: "2026-10-15",
      title: "Demo disaster response equipment appropriation", amount, departmentId: app.implementingUnitId,
      papCode: app.papCode, expenseClass: "capitalOutlay", fund: "generalFund", status: "enacted",
      remarks: "Local test allocation based on the form's budget ceiling. No enacted ordinance is asserted.",
    });
    const scenario = {
      ...provenance, from: "2026-10-15", through: "2026-11-06", sourceStatus: source.Status,
      originalHold: app.recoveryImport.hold, sourceDates: { prebid: "2026-03-06", bidOpening: "2026-03-20", award: "2026-04-03", supplierReceipt: "2026-04-06" }, events,
    };
    await update("appEntry", app, {
      status: "approved", planStage: "finalApp", appropriationId: appropriation.id, postedAt: at("10-15T14:42"),
      targetStartQuarter: "Q4", targetCompletionQuarter: "Q4",
      recoveryImport: { ...app.recoveryImport, hold: false, ongoingScenario: scenario },
    }, { scenario });
    await update("purchaseRequisition", pr, {
      dateRequired: "2026-11-06", totalAmount: amount, status: "approved", fundSource: appropriation.fund,
      submittedAt: at("10-16T08:47"), cashCertifiedAt: at("10-16T15:08"),
      mayorApprovedAt: at("10-19T09:36"), appropriationCertifiedAt: at("10-19T13:51"),
      fundsReservedAt: at("10-19T16:07"), modeDeterminedAt: at("10-20T09:12"),
      procurementModeId: mode.id, suggestedModeKey: mode.key,
    });
    await update("prLineItem", item, {
      technicalSpecifications: source["Technical Specifications"], unit: "Lot", quantity: 1,
      unitCost: amount, lineTotal: amount, hasUsefulLifeOverOneYear: true, assetClass: "capitalOutlay",
    });
    await create(Obligation, "obligation", {
      obligationNo: "DEMO-ORS-2026-MDRRMO", amount, certifiedAt: at("10-19T16:07"),
      particulars: "Local test commitment for one lot of emergency response equipment.",
      prHeaderId: pr.id, appropriationId: appropriation.id,
    });
    await ensureAllocation();

    const schedule = {
      procurementStartAt: at("10-20T09:12"), publicationStartAt: at("10-20T14:16"),
      publicationEndAt: at("11-05T10:00"), closingDate: at("11-05T10:00"),
      prebidRequired: true, prebidAt: at("10-22T10:00"), prebidVenue: source["Bid Opening / Conference Venue"],
      openingDate: at("11-05T10:30"), evaluationStartAt: at("11-06T09:24"),
    };
    assert.equal(scheduleValidationError(schedule), null);
    assert.equal(new Set(events.map((event) => event.occurredAt)).size, events.length);
    assert.ok(events.every((event, index) => {
      const local = new Date(Date.parse(event.occurredAt) + 8 * 3600_000);
      return local.toISOString().slice(0, 10) >= scenario.from
        && local.toISOString().slice(0, 10) <= scenario.through
        && local.getUTCHours() >= 8 && local.getUTCHours() < 17
        && local.getUTCDay() >= 1 && local.getUTCDay() <= 5
        && (index === 0 || event.occurredAt > events[index - 1].occurredAt);
    }));
    const rfq = await create(Rfq, "rfq", {
      ...schedule, referenceNo: "DEMO-ITB-2026-MDRRMO", title: app.projectTitle, abc: amount,
      status: "opened", appEntryId: app.id, prHeaderId: pr.id, procurementModeId: mode.id,
      publishDate: "2026-10-20", scheduleApprovedAt: at("10-20T11:23"), schedulePublishedAt: schedule.publicationStartAt,
      prebidRemarks: "Local test schedule. External publication is unverified.",
      openingVenue: source["Bid Opening / Conference Venue"], procurementContactPerson: "BAC Secretariat (test role)",
      requiredSupplierDocuments: source["Required Supplier Documents"],
    });
    const vendor = await create(Vendor, "vendor", {
      businessName: "MDRRMO Demonstration Supplier", referenceCode: "DEMO-MDRRMO-2026",
      supplierCategory: source["Supplier Category"], registrationStatus: "verified",
      reviewedAt: at("11-04T09:53"), reviewRemarks: "Synthetic vendor for the isolated demonstration.",
    });
    await create(Bid, "bid", {
      rfqId: rfq.id, vendorId: vendor.id, submittedAt: at("11-04T14:11"),
      technicalSubmitted: true, financialSealed: true, blindLabel: "Bidder A", status: "opened",
      remarks: "Synthetic bid. Technical checklist pending.",
    });
    await create(BidOpeningRecord, "bidOpeningRecord", {
      rfqId: rfq.id, openedAt: schedule.openingDate, bidsReceived: 1,
      remarks: "Demonstration opening. Technical submission forwarded for review.",
    });
    for (const [label, filename, date, body] of [
      ["Demonstration equipment requirements", "demo-equipment-requirements.txt", "10-20T14:16", source["Technical Specifications"]],
      ["Demonstration pre-bid notes", "demo-pre-bid-notes.txt", "10-22T13:14", "Suppliers should provide a unit breakdown for the single lot, product specifications and the required eligibility documents."],
    ]) {
      const content = Buffer.from(`LOCAL DEMONSTRATION | ${rfq.referenceNo}\n${label}\n\n${body}\n`);
      await create(Document, "document", {
        entityRef: "rfq", entityId: rfq.id, label, filename, content, mimeType: "text/plain",
        sizeBytes: content.length, checksum: createHash("sha256").update(content).digest("hex"), uploadedAt: at(date),
      });
    }
    return { appId: app.id, rfqId: rfq.id };
  });
  const chain = await verifyChain();
  assert.deepEqual(chain.problems, baseline.problems);
  const project = await getPublicProject(ids.appId);
  assert.equal(project.category, "ongoing");
  assert.equal(project.records.awards.length, 0);
  assert.equal(project.records.contracts.length, 0);
  assert.equal(project.records.payments.length, 0);
  assert.equal(project.records.solicitations.length, 1);
  assert.equal(project.records.solicitations[0].bidsReceived, 1);
  assert.equal(project.financials.allocated, 1500000);
  assert.equal(project.financials.available, 0);
  console.log({ ...ids, category: project.category, phase: project.phase, milestones: events.length,
    auditAdded: chain.entriesChecked - baseline.entriesChecked, preexistingAuditFindings: baseline.problems.length });
} finally {
  await sequelize.close();
}
