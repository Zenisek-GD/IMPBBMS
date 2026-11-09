import { createHash } from "node:crypto";
import { Op } from "sequelize";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { AipEntry, InvestmentProgram } from "../models/investmentProgramModel.js";
import { Appropriation } from "../models/appropriationModel.js";
import { PrHeader, PrLineItem } from "../models/prModel.js";
import { RecordFingerprint } from "../models/integrityModel.js";
import { fingerprintOf } from "./integrityMonitor.js";
import { withAuditTransaction } from "./auditLog.js";
import { nextSequenceNo, withSequenceRetry } from "./sequenceNo.js";
import { validDateOnly } from "./procurementInformation.js";
import { workflowError } from "./workflowSupport.js";

export const RECOVERY_CHECKPOINT = "Item Description: Emergency response equipment and supplies";
export const RECOVERY_LABELS = Object.freeze([
  "Fiscal Year", "Project Title", "Project Description", "Procurement Category",
  "Goods, Infrastructure, or Consulting", "Implementing Office", "Development Goal / Sector",
  "Expected Output", "Linked AIP Project", "Fund Source", "Expense Class", "Approved Budget for the Contract",
  "Unit of Measure", "Quantity", "Recommended Procurement Mode", "Reason for Alternative Procurement Mode",
  "Procurement Start Quarter", "Procurement Completion Quarter", "PAP Code", "MFO / Account Code",
  "Appropriation Reference for Final APP", "Purchase Requisition Purpose", "Date Required", "Emergency Purchase",
  "Emergency Justification", "Requesting Office", "Requested By", "Item Description",
]);

export const recoveryField = (recovery, label) => recovery?.sourceFields?.find((field) => field.label === label)?.value ?? null;
export const assertRecoveryNotHeld = (entry) => {
  if (entry?.recoveryImport?.hold) throw workflowError("This recovered draft is held at Item Description. Verify its missing planning, funding and requisition information before proceeding.", 409);
};

// All source wording remains in sourceFields; enums and business dates receive
// only unambiguous transformations. No source value is inferred from a budget,
// photograph, seed data, original-date claim or neighbouring project.
export const validateRecoveryManifest = (manifest) => {
  if (manifest?.version !== 1 || manifest.checkpoint !== RECOVERY_CHECKPOINT) throw new Error("Invalid recovery scope or version.");
  if (!/^[a-f0-9]{64}$/.test(manifest.source?.sha256 ?? "") || !manifest.source?.filename?.endsWith(".docx")) throw new Error("A DOCX source and SHA-256 are required.");
  if (manifest.fields?.length !== RECOVERY_LABELS.length || manifest.fields.some((field, index) => field.label !== RECOVERY_LABELS[index] || typeof field.value !== "string" || !field.value.trim())) throw new Error("The form must contain exactly the authorized fields in their original order.");
  const values = Object.fromEntries(manifest.fields.map((field) => [field.label, field.value]));
  if (values["Item Description"] !== RECOVERY_CHECKPOINT.split(": ")[1]) throw new Error("Item Description does not match the stopping point.");
  const year = Number(values["Fiscal Year"]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Invalid fiscal year.");
  const category = { Goods: "goods", Infrastructure: "infrastructure", Consulting: "consulting" }[values["Goods, Infrastructure, or Consulting"]];
  if (!category) throw new Error("Unsupported procurement classification.");
  if (values["Recommended Procurement Mode"] !== "Public Bidding") throw new Error("This scoped importer requires an explicit Public Bidding response.");
  if (values["Emergency Purchase"] !== "No" || values["Emergency Justification"] !== "Not applicable") throw new Error("This recovery requires the source's explicit No and Not applicable responses.");
  if (!/^Not applicable(?:\s+[–—-].+)?\.$/u.test(values["Reason for Alternative Procurement Mode"])) throw new Error("Expected the explicit not-applicable public-bidding reason.");
  const amount = /^PHP ([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)\.([0-9]{2})$/.exec(values["Approved Budget for the Contract"]);
  if (!amount) throw new Error("ABC must be a peso amount with two decimal places.");
  const abc = `${amount[1].replaceAll(",", "")}.${amount[2]}`;
  if (Number(abc) <= 0 || Number(abc) >= 1e13) throw new Error("ABC is outside the supported range.");
  const quantity = Number(values.Quantity);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Planning quantity must be a positive integer.");
  const quarters = ["Procurement Start Quarter", "Procurement Completion Quarter"].map((label) => {
    const match = /^(Q[1-4]) ([0-9]{4})$/.exec(values[label]);
    if (!match || Number(match[2]) !== year) throw new Error("The source quarter must include the matching fiscal year.");
    return match[1];
  });
  if (quarters[0] > quarters[1]) throw new Error("Completion quarter precedes start quarter.");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const date = /^([A-Za-z]+) ([0-9]{1,2}), ([0-9]{4})$/.exec(values["Date Required"]);
  const month = date ? months.indexOf(date[1]) + 1 : 0;
  const dateRequired = date && month ? `${date[3]}-${String(month).padStart(2, "0")}-${date[2].padStart(2, "0")}` : "";
  if (!validDateOnly(dateRequired)) throw new Error("The source date required is invalid.");
  const officeCode = /\(([A-Z][A-Z0-9_-]*)\)$/.exec(values["Implementing Office"])?.[1];
  if (!officeCode || !values["PAP Code"].startsWith(`${officeCode}-${year}-`)) throw new Error("An explicit implementing-office abbreviation matching the PAP code is required.");
  const recoveryKey = `${year}:${values["PAP Code"]}`;
  const sourceDigest = createHash("sha256").update(JSON.stringify(manifest.fields.map(({ label, value }) => ({ label, value })))).digest("hex");
  return { values, year, category, abc, quantity, quarters, dateRequired, officeCode, recoveryKey, sourceDigest };
};

export const inspectRecoveryDependencies = async (manifest, { transaction } = {}) => {
  const source = validateRecoveryManifest(manifest), v = source.values;
  const office = await Department.findOne({ where: { [Op.or]: [{ code: source.officeCode }, { name: v["Implementing Office"] }, { name: v["Requesting Office"] }] }, transaction });
  if (office && (office.status !== "active" || ![v["Implementing Office"], v["Requesting Office"]].includes(office.name) || office.code !== source.officeCode)) throw new Error("The existing office conflicts with the client form. No record was overwritten.");
  const candidates = await AppEntry.findAll({ attributes: ["id", "projectTitle", "papCode", "fiscalYear"], where: { fiscalYear: source.year, [Op.or]: [{ papCode: v["PAP Code"] }, { projectTitle: v["Project Title"] }] }, transaction });
  if (candidates.length > 1) throw new Error("Multiple matching procurement plans exist; duplicates must be reviewed before recovery.");
  const aips = await AipEntry.findAll({ where: { [Op.or]: [{ title: v["Linked AIP Project"] }, { reference: v["Linked AIP Project"] }] }, include: [{ model: InvestmentProgram, as: "program" }], transaction });
  const aip = aips.filter((row) => row.program?.fiscalYear === source.year && row.program.status === "adopted" && row.status === "planned" && row.implementingUnitId === office?.id);
  const appropriations = office ? await Appropriation.findAll({ where: { fiscalYear: source.year, departmentId: office.id, status: "enacted", [Op.or]: [{ ordinanceNo: v["Appropriation Reference for Final APP"] }, { title: v["Appropriation Reference for Final APP"] }] }, transaction }) : [];
  // A combined CO/MOOE response and named earmarked fund do not identify a
  // single ledger class/fund. Keep the reference without asserting authority.
  const blockers = [
    "The form does not verify the original entry timestamps or approval actions.",
    "Requested By is an officer title; a named, verified requester account was not supplied.",
    "Requisition item quantity, unit cost, useful life and asset classification are outside the authorized checkpoint; the partial item remains unanswered.",
    "The historical Date Required is preserved and cannot satisfy a new non-emergency submission's current lead-time rule.",
  ];
  if (aip.length !== 1) blockers.push("The named adopted FY 2026 AIP project and its verified development-goal linkage are not available.");
  if (appropriations.length !== 1 || v["Expense Class"].includes("/") || !["generalFund", "specialEducationFund", "trustFund"].includes(v["Fund Source"])) blockers.push("The named appropriation, exact fund ledger, ordinance evidence and Capital Outlay / MOOE allocation require verification; no budget split or enactment was inferred.");
  return { source, office, existingAppId: candidates[0]?.id ?? null, aipEntryId: aip.length === 1 ? aip[0].id : null, appropriationId: null, blockers };
};

const state = (row) => JSON.parse(JSON.stringify(row.get({ plain: true })));
export const reconstructedProgression = (fields) => {
  const from = Date.parse("2026-09-25T00:00:00Z"), byDate = new Map();
  fields.forEach((field, index) => {
    const offset = Math.floor(index * 14 / (fields.length - 1));
    const activityDate = new Date(from + offset * 86400000).toISOString().slice(0, 10);
    if (!byDate.has(activityDate)) byDate.set(activityDate, []);
    byDate.get(activityDate).push({ label: field.label, value: field.value });
  });
  return [...byDate].map(([activityDate, sourceFields], index) => ({
    sequence: index + 1, activityDate, dateVerification: "reconstructed", actorId: null,
    basis: "Reconstructed field-entry progression within the user-reported period; not a verified historical event date.", sourceFields,
  }));
};
export const restoreProcurement = async (manifest, { reconstructProgression = false } = {}) => withSequenceRetry(() => withAuditTransaction(async (transaction, audit) => {
  const plan = await inspectRecoveryDependencies(manifest, { transaction });
  const { source, blockers } = plan, v = source.values;
  if (plan.existingAppId) {
    const existing = await AppEntry.findByPk(plan.existingAppId, { transaction, lock: transaction.LOCK.UPDATE });
    if (existing.recoveryKey !== source.recoveryKey || existing.recoveryImport?.sourceDigest !== source.sourceDigest) throw new Error("A matching existing project has different or unverified provenance. No overwrite or duplicate is permitted.");
    if (existing.projectTitle !== v["Project Title"] || existing.description !== v["Project Description"] || Number(existing.abc) !== Number(source.abc) || existing.papCode !== v["PAP Code"] || existing.status !== "draft") throw new Error("The existing recovery record has changed. Review it before rerunning the import.");
    const prs = await PrHeader.findAll({ where: { appEntryId: existing.id }, include: [{ model: PrLineItem, as: "lineItems" }], transaction });
    if (prs.length !== 1 || prs[0].status !== "draft" || prs[0].dateRequired !== source.dateRequired || prs[0].purpose !== v["Purchase Requisition Purpose"] || prs[0].isEmergency !== false || prs[0].totalAmount !== null || prs[0].lineItems.length !== 1 || prs[0].lineItems[0].description !== v["Item Description"] || prs[0].lineItems[0].technicalSpecifications !== null) throw new Error("The existing recovery requisition is incomplete or has changed. No new records were written.");
    return { status: "alreadyImported", appEntryId: existing.id, prHeaderId: prs[0].id, prNumber: prs[0].prNumber, lineItemId: prs[0].lineItems[0].id, importedAt: existing.recoveryImport.importedAt, blockers: existing.recoveryImport.blockers, checkpoint: RECOVERY_CHECKPOINT };
  }
  const importedAt = new Date().toISOString();
  const recovery = {
    version: 1, kind: "historicalDataRecovery", hold: true, importedAt,
    source: manifest.source, sourceDigest: source.sourceDigest,
    sourceFields: manifest.fields, checkpoint: RECOVERY_CHECKPOINT, blockers,
    reportedOriginalEntryPeriod: { from: "2026-09-25", through: "2026-10-09", basis: "User reported; exact record timestamps unavailable" },
    historicalActivity: { verification: "unverified", originalCreatedAt: null, originalUpdatedAt: null, verifiedEvents: [] },
    reconstructedProgression: reconstructProgression ? reconstructedProgression(manifest.fields) : [],
    systemReferencePolicy: "The PR number is allocated during recovery and is not claimed as the lost original reference.",
  };
  const writeAudit = async (entityRef, row) => audit({
    actionType: "data.recovery.import", entityRef, entityId: row.id,
    actorId: null, actorName: "Procurement recovery import", actorRole: "system", outcome: "success",
    summary: `${entityRef} #${row.id}: restored from the client form through Item Description`,
    beforeState: null, afterState: { record: state(row), recovery: { recoveryKey: source.recoveryKey, importedAt, source: manifest.source, checkpoint: RECOVERY_CHECKPOINT, historicalActivity: recovery.historicalActivity } },
  });
  let office = plan.office;
  if (!office) {
    office = await Department.create({ name: v["Implementing Office"], code: source.officeCode, type: "endUser", status: "active", headUserId: null }, { transaction });
    await writeAudit("department", office);
  }
  const app = await AppEntry.create({
    projectTitle: v["Project Title"], description: v["Project Description"], categoryDetails: v["Procurement Category"], category: source.category,
    fiscalYear: source.year, abc: source.abc, unit: v["Unit of Measure"], quantity: source.quantity,
    fundSource: v["Fund Source"], papCode: v["PAP Code"], accountCode: v["MFO / Account Code"],
    procurementMode: "competitiveBidding", targetStartQuarter: source.quarters[0], targetCompletionQuarter: source.quarters[1],
    justificationStatus: "notApplicable", justification: null, implementingUnitId: office.id,
    aipEntryId: plan.aipEntryId, appropriationId: null, createdById: null, status: "draft", planStage: "ppmp", planCycle: "final",
    earlyProcurement: null,
    recoveryKey: source.recoveryKey, recoveryImport: recovery,
  }, { transaction });
  const appAudit = await writeAudit("appEntry", app);
  await RecordFingerprint.create({ entityRef: "appEntry", entityId: app.id, fingerprint: fingerprintOf("appEntry", app), lastAuditSequence: appAudit.sequence }, { transaction });
  const pr = await PrHeader.create({
    prNumber: await nextSequenceNo(PrHeader, "prNumber", "PR", new Date().getFullYear(), { transaction }),
    purpose: v["Purchase Requisition Purpose"], dateRequired: source.dateRequired, isEmergency: false,
    justificationStatus: "notApplicable", justification: null, totalAmount: null, status: "draft",
    appEntryId: app.id, departmentId: office.id, requesterId: null,
  }, { transaction });
  const prAudit = await writeAudit("purchaseRequisition", pr);
  await RecordFingerprint.create({ entityRef: "purchaseRequisition", entityId: pr.id, fingerprint: fingerprintOf("purchaseRequisition", pr), lastAuditSequence: prAudit.sequence }, { transaction });
  const item = await PrLineItem.create({
    prHeaderId: pr.id, description: v["Item Description"], technicalSpecifications: null,
    unit: null, quantity: null, unitCost: null, lineTotal: null, hasUsefulLifeOverOneYear: null, assetClass: null,
  }, { transaction });
  await writeAudit("prLineItem", item);
  for (const event of recovery.reconstructedProgression) {
    await audit({
      actionType: "data.recovery.progression.reconstructed", entityRef: "appEntry", entityId: app.id,
      actorId: null, actorName: "Procurement recovery import", actorRole: "system", outcome: "success",
      summary: `Reconstructed progression ${event.activityDate}: ${event.sourceFields.map((field) => field.label).join(", ")}`,
      beforeState: null, afterState: { ...event, recoveryKey: source.recoveryKey, importedAt, checkpoint: RECOVERY_CHECKPOINT, source: manifest.source },
    });
  }
  return { status: "restored", departmentId: office.id, appEntryId: app.id, prHeaderId: pr.id, prNumber: pr.prNumber, lineItemId: item.id, importedAt, blockers, checkpoint: RECOVERY_CHECKPOINT };
}));
