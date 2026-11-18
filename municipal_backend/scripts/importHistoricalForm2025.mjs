import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { Rfq, Award, Bid } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Contract, Delivery } from "../models/contractModel.js";
import { Invoice, Payment } from "../models/paymentModel.js";
import { computeDeductions } from "../services/deductions.js";
import { AuditLog } from "../models/auditLogModel.js";
import { RecordFingerprint } from "../models/integrityModel.js";
import { fingerprintOf } from "../services/integrityMonitor.js";
import { withAuditTransaction, verifyChain } from "../services/auditLog.js";
import { listPublicProjects, getPublicProject } from "../services/projectLifecycle.js";

assert.ok(process.argv[2], "Pass the path to Procurement_Information_Form_3_Projects_2025.docx.");
const sourcePath = resolve(process.argv[2]);
const source = "Procurement_Information_Form_3_Projects_2025.docx";
assert.equal(basename(sourcePath), source);
const sourceDigest = createHash("sha256").update(readFileSync(sourcePath)).digest("hex").toUpperCase();
const lines = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
  $ErrorActionPreference = 'Stop'
  [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($env:PROCUREMENT_IMPORT_SOURCE)
  try {
    $reader = [IO.StreamReader]::new($zip.GetEntry('word/document.xml').Open())
    try { [xml]$doc = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $lines = @($doc.SelectNodes("//*[local-name()='p']") | ForEach-Object {
      ($_.SelectNodes(".//*[local-name()='t']") | ForEach-Object InnerText) -join ''
    } | Where-Object { $_ })
    ConvertTo-Json -InputObject $lines
  } finally { $zip.Dispose() }
`], { encoding: "utf8", env: { ...process.env, PROCUREMENT_IMPORT_SOURCE: sourcePath } }));
const starts = lines.flatMap((line, index) => /^PROJECT [123]:/.test(line) ? [index] : []);
assert.equal(starts.length, 3);
const projects = starts.map((start, index) => {
  const rows = lines.slice(start + 1, starts[index + 1] ?? lines.length);
  assert.equal(rows.length % 2, 0);
  return Object.fromEntries(rows.flatMap((label, i) => i % 2 ? [] : [[label, rows[i + 1]]]));
});
const money = (value) => Number(value.replace(/^PHP\s+/, "").replaceAll(",", ""));
const optional = (value) => /^(?:none|n\/?a|not applicable)(?:\s*[–—-].*)?$/i.test(value?.trim() ?? "") ? null : value?.trim() || null;
const localDate = (value, time = "12:00 PM") => {
  const date = new Date(`${value} ${time} GMT+0800`);
  assert.ok(Number.isFinite(date.getTime()), `Invalid source date: ${value} ${time}`);
  return date;
};
const dateOnly = (value) => localDate(value).toISOString().slice(0, 10);

// Date-only source facts remain date-only. These times are demonstration
// milestones in Asia/Manila and never become the audit log's recordedAt.
const completionPlans = [
  {
    dates: ["09-24T09:20", "09-25T13:35", "09-30T10:45", "09-30T14:10", "10-02T11:25", "10-06T08:50", "10-07T15:20"],
    delivery: "One lot of assorted office and janitorial supplies delivered and checked against the item list.",
  },
  {
    dates: ["10-01T11:05", "10-03T08:40", "10-13T14:30", "10-16T10:15", "10-20T13:55", "10-21T15:05", "10-24T09:45"],
    delivery: "Desktop computers, UPS units and managed switches delivered, installed and function-tested as one lot.",
  },
  {
    dates: ["09-25T14:25", "09-26T07:50", "10-29T16:05", "10-31T11:40", "11-03T09:10", "11-04T14:50", "11-05T10:30"],
    delivery: "Health center repairs, painting, electrical and plumbing work completed and checked at final inspection.",
  },
];

try {
  assert.equal(sequelize.config.host, "127.0.0.1");
  assert.equal(sequelize.config.database, "municipal_backend");
  const before = await verifyChain();
  const baseline = JSON.stringify(await AppEntry.findAll({ order: [["id", "ASC"]], raw: true }));
  const existingIds = JSON.parse(baseline).map(({ id }) => id);
  const written = await withAuditTransaction(async (transaction, audit) => {
    const options = { transaction };
    const result = [];
    for (const [index, p] of projects.entries()) {
      const papCode = p["PAP Code"];
      const recoveryKey = "form-2025:" + papCode;
      const existing = await AppEntry.findOne({ ...options, where: { [Op.or]: [{ recoveryKey }, { papCode }, { projectTitle: p["Project Title"] }] } });
      if (existing) {
        assert.equal(existing.recoveryKey, recoveryKey);
        assert.equal(existing.recoveryImport.sourceDigest, sourceDigest);
        result.push(existing.id);
        continue;
      }
      const office = await Department.findOne({ ...options, where: { name: ["General Services Office (GSO)", "Information Technology Office", "Municipal Engineering Office"][index] } });
      assert.ok(office);
      const sourceFields = Object.entries(p).map(([label, value]) => ({ label, value }));
      const supplierMismatch = p["Registered Business Name"] !== p["Award Recommended Supplier"];
      const recoveryImport = { source, sourceDigest, sourceFields, importedAt: new Date().toISOString(), sourceStatus: p.Status, supplierMismatch, hold: true };
      const app = await AppEntry.create({
        projectTitle: p["Project Title"], description: p["Project Description"], fiscalYear: 2025,
        category: p["Goods, Infrastructure, or Consulting"], categoryDetails: p["Procurement Category"],
        procurementMode: index === 0 ? "smallValueProcurement" : "competitiveBidding",
        abc: money(p["Approved Budget for the Contract"]), quantity: Number(p.Quantity),
        unit: p["Unit of Measure"], fundSource: p["Fund Source"], papCode,
        uacsCode: p["UACS Code"], accountCode: p["MFO / Account Code"],
        targetStartQuarter: p["Procurement Start Quarter"].slice(0, 2),
        targetCompletionQuarter: p["Procurement Completion Quarter"].slice(0, 2),
        implementingUnitId: office.id, recoveryKey, recoveryImport,
      }, options);
      const dateRequired = new Date(p["Date Required"] + " 12:00:00 GMT+0800").toISOString().slice(0, 10);
      const pr = await PrHeader.create({
        appEntryId: app.id, departmentId: office.id, prNumber: papCode,
        purpose: p["Purchase Requisition Purpose"], dateRequired, isEmergency: false,
        justification: optional(p["Emergency Justification"]), justificationStatus: "notApplicable",
        totalAmount: money(p["Estimated Unit Cost"]) * Number(p["Item Quantity"]),
      }, options);
      const item = await PrLineItem.create({
        prHeaderId: pr.id, description: p["Item Description"], technicalSpecifications: p["Technical Specifications"],
        unit: p["Item Unit of Measure"], quantity: Number(p["Item Quantity"]),
        unitCost: money(p["Estimated Unit Cost"]), lineTotal: money(p["Estimated Unit Cost"]) * Number(p["Item Quantity"]),
        hasUsefulLifeOverOneYear: p["Useful Life Exceeds One Year"] === "Yes",
      }, options);
      for (const [entityRef, row] of [["appEntry", app], ["purchaseRequisition", pr], ["prLineItem", item]]) {
        const event = await audit({
          actionType: "data.recovery.import", entityRef, entityId: row.id,
          actorName: "Procurement records import", actorRole: "system",
          summary: `FY 2025 procurement form recorded for ${papCode}`,
          afterState: { source, papCode, supplierMismatch, sourceStatus: p.Status },
        });
        if (entityRef !== "prLineItem") await RecordFingerprint.create({
          entityRef, entityId: row.id, fingerprint: fingerprintOf(entityRef, row), lastAuditSequence: event.sequence,
        }, options);
      }
      assert.equal(item.prHeaderId, pr.id);
      assert.equal(pr.appEntryId, app.id);
      result.push(app.id);
    }

    for (const [index, p] of projects.entries()) {
      const app = await AppEntry.findByPk(result[index], { ...options, lock: transaction.LOCK.UPDATE });
      const pr = await PrHeader.findOne({ ...options, where: { appEntryId: app.id } });
      const existing = app.recoveryImport.historicalAward;
      if (app.recoveryImport.demonstrationCompletion) {
        const award = await Award.findByPk(existing.id, options);
        assert.equal(award.noaNumber, p["Existing Notice of Award Number"]);
        continue;
      }
      const mode = await ProcurementMode.findOne({ ...options, where: { key: app.procurementMode } });
      assert.ok(mode);
      const openingDate = localDate(p["Bid Opening Date"], p["Bid Opening Time"]);
      const closingDate = localDate(p["Closing Date"], p["Closing Time"]);
      const noaDate = dateOnly(p["Notice of Award Date"]);
      const supplierReceivedAt = dateOnly(p["Supplier Receipt Date"]);
      assert.ok(openingDate >= closingDate && noaDate >= dateOnly(p["Bid Opening Date"]) && supplierReceivedAt >= noaDate);
      const prebid = /^Yes [–-] (.+), (\d+:\d+ [AP]M)$/.exec(p["Pre-Bid Conference"]);
      const rfq = existing ? await Rfq.findByPk((await Award.findByPk(existing.id, options)).rfqId, options) : await Rfq.create({
        referenceNo: p["PhilGEPS Reference Number"], philgepsReference: p["PhilGEPS Reference Number"],
        title: p["Solicitation Title"], abc: app.abc, category: app.category.toLowerCase(),
        appEntryId: app.id, prHeaderId: pr.id, procurementModeId: mode.id, status: "awarded",
        closingDate, openingDate, prebidAt: prebid ? localDate(prebid[1], prebid[2]) : null,
        openingVenue: optional(p["Bid Opening / Conference Venue"]),
        procurementContactPerson: optional(p["Procurement Contact Person"]),
        procurementContactEmail: optional(p["Procurement Contact Email"]),
        requiredSupplierDocuments: optional(p["Required Supplier Documents"]),
      }, options);
      const bid = await Bid.create({
        rfqId: rfq.id, totalBidPrice: money(p["Supplier Bid / Total Quotation"]),
        technicalSubmitted: true, financialSealed: false,
        status: app.recoveryImport.supplierMismatch ? "postQualified" : "awarded",
        remarks: p.Findings,
      }, options);
      const award = existing ? await Award.findByPk(existing.id, options) : await Award.create({
        rfqId: rfq.id, noaNumber: p["Existing Notice of Award Number"], noaDate, supplierReceivedAt,
        amount: money(p["Recommended Award Amount"]), status: "accepted", awardBasis: "LCRB",
        bidId: app.recoveryImport.supplierMismatch ? null : bid.id,
      }, options);
      assert.ok(Number(award.amount) <= Number(rfq.abc));
      const historicalAward = {
        id: award.id, resolutionNumber: p["BAC Resolution Number"], supplierReceivedAt,
        supplierMismatch: app.recoveryImport.supplierMismatch,
        registeredSupplier: p["Registered Business Name"], recommendedSupplier: p["Award Recommended Supplier"],
      };
      if (existing) await award.update({
        status: "accepted", bidId: historicalAward.supplierMismatch ? null : bid.id,
      }, options);
      await pr.update({ status: "approved", procurementModeId: mode.id }, options);
      const item = await PrLineItem.findOne({ ...options, where: { prHeaderId: pr.id } });
      await item.update({ assetClass: index === 0 ? "expense" : "capitalOutlay" }, options);
      const plan = completionPlans[index];
      const dates = plan.dates.map((date) => new Date(`2025-${date}:00+08:00`));
      assert.ok(plan.dates.every((date) => date >= "09-24T00:00" && date < "11-06T00:00"));
      assert.ok(dates.every((date, i) => i === 0 || date >= dates[i - 1]));
      const [instrumentAt, noticeToProceedAt, deliveredAt, inspectedAt, submittedAt, preparedAt, releasedAt] = dates;
      const amount = Number(award.amount);
      const remarks = "Generated historical demonstration.";
      const ref = `DEMO-${app.papCode}`;
      const contract = await Contract.create({
        awardId: award.id, contractNo: `${ref}-${index === 2 ? "CONTRACT" : "PO"}`,
        amount, amountPaid: amount, category: rfq.category, status: "completed",
        instrumentType: index === 2 ? "contract" : "purchaseOrder",
        startDate: plan.dates[1].slice(0, 5).replace(/^/, "2025-"),
        deliveryDeadline: index === 2 ? "2025-11-03" : index === 1 ? "2025-10-21" : "2025-10-03",
        noticeToProceedAt, actualCompletionAt: inspectedAt, terms: remarks,
      }, options);
      const delivery = await Delivery.create({
        contractId: contract.id, deliveredAt, inspectedAt, description: plan.delivery,
        status: "accepted", acceptedValue: amount, remarks,
      }, options);
      const invoice = await Invoice.create({
        contractId: contract.id, deliveryId: delivery.id, invoiceNo: `${ref}-INV`,
        submittedAt, amount, status: "paid", remarks,
      }, options);
      const taxProfile = { isVatRegistered: index !== 0, taxClassification: index === 2 ? "services" : "goods" };
      const deductions = computeDeductions({ grossAmount: amount, vendor: taxProfile, contract, asOf: inspectedAt });
      await contract.update({ retentionHeld: deductions.retentionAmount }, options);
      const payment = await Payment.create({
        ...deductions, invoiceId: invoice.id, disbursementNo: `${ref}-DV`,
        deductionBreakdown: deductions.breakdown, amount: deductions.netAmount,
        preparedAt, releasedAt, status: "released", remarks,
      }, options);
      const milestones = [
        ["contract", contract, "Procurement instrument recorded", instrumentAt],
        ["contract", contract, "Implementation started", noticeToProceedAt],
        ["delivery", delivery, "Delivery reported", deliveredAt],
        ["delivery", delivery, "Inspection and acceptance recorded", inspectedAt],
        ["invoice", invoice, "Invoice submitted", submittedAt],
        ["payment", payment, "Disbursement prepared", preparedAt],
        ["payment", payment, "Disbursement released", releasedAt],
      ];
      const demonstrationCompletion = {
        kind: "historicalDemonstration", contractId: contract.id, deliveryId: delivery.id,
        invoiceId: invoice.id, paymentId: payment.id, taxProfile,
        milestones: milestones.map(([entityRef, row, action, occurredAt]) => ({ entityRef, entityId: row.id, action, occurredAt })),
      };
      await app.update({ recoveryImport: { ...app.recoveryImport, historicalAward, demonstrationCompletion } }, options);
      for (const [entityRef, row, action, occurredAt] of milestones) {
        const event = await audit({
          actionType: "data.recovery.demonstration", entityRef, entityId: row.id, actorRole: "system",
          summary: `${action} example imported for ${app.papCode}`,
          afterState: { source, appEntryId: app.id, provenance: demonstrationCompletion.kind, occurredAt, status: row.status },
        });
        if (entityRef === "contract" || entityRef === "payment") {
          await RecordFingerprint.upsert({
            entityRef, entityId: row.id, fingerprint: fingerprintOf(entityRef, row), lastAuditSequence: event.sequence,
          }, options);
        }
      }
      for (const [entityRef, row] of [["bid", bid], ["purchaseRequisition", pr]]) {
        const event = await audit({
          actionType: "data.recovery.import", entityRef, entityId: row.id, actorRole: "system",
          summary: `Source ${entityRef} linked for ${app.papCode}`,
          afterState: { source, appEntryId: app.id, status: row.status, submissionDate: p["Submission Date"] },
        });
        await RecordFingerprint.upsert({
          entityRef, entityId: row.id, fingerprint: fingerprintOf(entityRef, row), lastAuditSequence: event.sequence,
        }, options);
      }
      await audit({
        actionType: "data.recovery.import", entityRef: "rfq", entityId: rfq.id, actorRole: "system",
        summary: `Solicitation record imported for ${app.papCode}`,
        afterState: { source, appEntryId: app.id, prHeaderId: pr.id, referenceNo: rfq.referenceNo, closingDate, openingDate },
      });
      const event = await audit({
        actionType: "data.recovery.import", entityRef: "award", entityId: award.id, actorRole: "system",
        summary: `${award.noaNumber} recorded from the FY 2025 procurement form`,
        afterState: { source, rfqId: rfq.id, noaNumber: award.noaNumber, noaDate, amount: award.amount, ...historicalAward },
      });
      await RecordFingerprint.upsert({
        entityRef: "award", entityId: award.id, fingerprint: fingerprintOf("award", award), lastAuditSequence: event.sequence,
      }, options);
    }
    return result;
  });
  const imported = await AppEntry.findAll({ where: { id: written }, order: [["id", "ASC"]] });
  assert.equal(imported.length, 3);
  assert.equal(imported.filter((app) => app.recoveryImport.supplierMismatch).length, 1);
  const completed = await listPublicProjects({ category: "completed", fiscalYear: 2025 });
  for (const app of imported) {
    const pr = await PrHeader.findOne({ where: { appEntryId: app.id } });
    assert.ok(await PrLineItem.findOne({ where: { prHeaderId: pr.id } }));
    const event = await AuditLog.findOne({ where: { entityRef: "appEntry", entityId: app.id, actionType: "data.recovery.import" } });
    assert.ok(event.recordedAt >= new Date("2026-01-01"));
    const fields = Object.fromEntries(app.recoveryImport.sourceFields.map(({ label, value }) => [label, value]));
    const award = await Award.findByPk(app.recoveryImport.historicalAward.id);
    const rfq = await Rfq.findByPk(award.rfqId);
    assert.equal(rfq.prHeaderId, pr.id);
    assert.equal(rfq.appEntryId, app.id);
    assert.equal(award.noaDate, dateOnly(fields["Notice of Award Date"]));
    assert.equal(award.supplierReceivedAt, dateOnly(fields["Supplier Receipt Date"]));
    assert.equal(award.approvedById, null);
    assert.equal(award.recommendedById, null);
    assert.equal(award.vendorId, null);
    assert.equal(award.bidId == null, app.recoveryImport.supplierMismatch);
    const awardEvent = await AuditLog.findOne({ where: { entityRef: "award", entityId: award.id, actionType: "data.recovery.import" } });
    assert.ok(awardEvent.recordedAt >= event.recordedAt);
    assert.equal(awardEvent.actorId, null);
    const example = app.recoveryImport.demonstrationCompletion;
    const contract = await Contract.findByPk(example.contractId);
    const delivery = await Delivery.findByPk(example.deliveryId);
    const invoice = await Invoice.findByPk(example.invoiceId);
    const payment = await Payment.findByPk(example.paymentId);
    assert.equal(contract.awardId, award.id);
    assert.equal(delivery.contractId, contract.id);
    assert.equal(invoice.contractId, contract.id);
    assert.equal(invoice.deliveryId, delivery.id);
    assert.equal(payment.invoiceId, invoice.id);
    for (const [row, key, i] of [[contract, "noticeToProceedAt", 1], [delivery, "deliveredAt", 2],
      [delivery, "inspectedAt", 3], [invoice, "submittedAt", 4], [payment, "preparedAt", 5], [payment, "releasedAt", 6]]) {
      assert.equal(row[key].toISOString(), example.milestones[i].occurredAt);
    }
    const exampleEvents = await AuditLog.findAll({
      where: { actionType: "data.recovery.demonstration", [Op.or]: example.milestones.map(({ entityRef, entityId }) => ({ entityRef, entityId })) },
      order: [["sequence", "ASC"]],
    });
    assert.equal(exampleEvents.length, example.milestones.length);
    let previousTime = -Infinity;
    for (const [i, milestone] of example.milestones.entries()) {
      const recorded = exampleEvents[i];
      assert.equal(recorded.entityRef, milestone.entityRef);
      assert.equal(recorded.entityId, milestone.entityId);
      assert.equal(recorded.afterState.occurredAt, milestone.occurredAt);
      assert.equal(recorded.summary, `${milestone.action} example imported for ${app.papCode}`);
      assert.ok(recorded.recordedAt >= app.createdAt && recorded.actorId === null);
      const date = Date.parse(milestone.occurredAt);
      assert.ok(date >= Date.parse("2025-09-24T00:00:00+08:00") && date < Date.parse("2025-11-06T00:00:00+08:00"));
      assert.ok(date >= previousTime);
      previousTime = date;
    }
    assert.equal(Number(payment.grossAmount), Number(award.amount));
    assert.equal(Number(delivery.acceptedValue), Number(invoice.amount));
    assert.equal(Number(contract.amountPaid), Number(invoice.amount));
    assert.ok(completed.some(({ id }) => id === app.id));
    const detail = await getPublicProject(app.id);
    assert.equal(detail.category, "completed");
    assert.equal(detail.records.awards[0].noaNumber, award.noaNumber);
    assert.equal(detail.phase, "completion");
    assert.equal(detail.records.contracts.length, 1);
    console.log(app.papCode, award.noaNumber, award.noaDate, award.supplierReceivedAt, awardEvent.recordedAt.toISOString(), detail.category);
  }
  const protectedBefore = JSON.parse(baseline).filter(({ id }) => !written.includes(id));
  const protectedAfter = await AppEntry.findAll({
    where: { id: existingIds.filter((id) => !written.includes(id)) }, order: [["id", "ASC"]], raw: true,
  });
  assert.equal(JSON.stringify(protectedAfter), JSON.stringify(protectedBefore));
  const after = await verifyChain();
  assert.deepEqual(after.problems, before.problems);
  console.log(JSON.stringify({ auditEntriesBefore: before.entriesChecked, auditEntriesAfter: after.entriesChecked, existingAuditProblems: after.problems.length }));
} finally {
  await sequelize.close();
}


