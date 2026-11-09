import "../config/env.js";
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sequelize, AppEntry, PrHeader, PrLineItem } from "../models/index.js";
import { createV2DatabaseBackup } from "../services/v2DatabaseBackup.js";
import { migrateProcurementRecovery } from "../services/migrateProcurementRecovery.js";
import { inspectRecoveryDependencies, restoreProcurement, validateRecoveryManifest } from "../services/procurementRecovery.js";
import { captureRecoveryBaseline, verifyRecoveryBaseline } from "../services/procurementRecoveryVerification.js";
import { recordAudit, verifyChain } from "../services/auditLog.js";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const outsideRepository = async (directory) => {
  if (!directory || !path.isAbsolute(directory)) throw new Error("Use an absolute private report directory outside the repository.");
  const relative = path.relative(repository, path.resolve(directory));
  if (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) throw new Error("Recovery reports must be outside the repository.");
  await mkdir(directory, { recursive: true });
  const resolved = await realpath(directory), resolvedRelative = path.relative(await realpath(repository), resolved);
  if (!resolvedRelative.startsWith(`..${path.sep}`) && resolvedRelative !== ".." && !path.isAbsolute(resolvedRelative)) throw new Error("The report directory resolves inside the repository.");
  return resolved;
};
const extract = async (source, destination) => {
  const script = fileURLToPath(new URL("./readProcurementRecoveryForm.ps1", import.meta.url));
  await new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", script, "-Source", source, "-Output", destination], { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let diagnostics = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (data) => { diagnostics += data.toString(); });
    child.once("error", () => reject(new Error("The Windows DOCX reader could not start.")));
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`DOCX scope extraction failed: ${diagnostics.slice(0, 2000)}`)));
  });
  return JSON.parse(await readFile(destination, "utf8"));
};

try {
  const { values } = parseArgs({ options: {
    source: { type: "string" }, database: { type: "string" }, "report-directory": { type: "string" },
    "backup-directory": { type: "string" }, mysqldump: { type: "string", default: "mysqldump" },
    apply: { type: "boolean", default: false }, help: { type: "boolean", short: "h" },
    "reconstruct-progression": { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("npm run restore:procurement -- --source /absolute/form.docx --database exact_database --report-directory /absolute/private/path [--apply --backup-directory /absolute/private/backups --mysqldump /absolute/mysqldump]");
  } else {
    if (!values.source || !path.isAbsolute(values.source)) throw new Error("Specify the client's DOCX using its absolute path.");
    if (!values.database || values.database !== sequelize.config.database) throw new Error("The explicit database must match the configured application database.");
    if (!["127.0.0.1", "localhost", "::1"].includes(sequelize.config.host)) throw new Error("This recovery command is scoped to the authorized local application database.");
    const directory = await outsideRepository(values["report-directory"]);
    const run = new Date().toISOString().replace(/[:.]/g, "-"), manifestPath = path.join(directory, `source-prefix-${run}.json`);
    const manifest = await extract(values.source, manifestPath);
    validateRecoveryManifest(manifest);
    await sequelize.authenticate();
    const preview = await inspectRecoveryDependencies(manifest);
    const previewResult = { database: sequelize.config.database, source: manifest.source, fields: manifest.fields.length, checkpoint: manifest.checkpoint, existingAppId: preview.existingAppId, existingOfficeId: preview.office?.id ?? null, aipEntryId: preview.aipEntryId, appropriationId: preview.appropriationId, blockers: preview.blockers };
    if (!values.apply) console.log(JSON.stringify({ status: "preview", ...previewResult }, null, 2));
    else {
      const backup = await createV2DatabaseBackup({ config: sequelize.config, backupDirectory: values["backup-directory"], mysqldumpPath: values.mysqldump });
      const baseline = await captureRecoveryBaseline(), auditBefore = await verifyChain();
      await writeFile(path.join(directory, `baseline-${run}.json`), JSON.stringify({ database: sequelize.config.database, backup, baseline, auditBefore }, null, 2), { mode: 0o600 });
      const migration = await migrateProcurementRecovery();
      if (migration.added.length || migration.changed.length) await recordAudit({
        actionType: "data.recovery.schema", entityRef: "procurementRecovery", actorId: null,
        actorName: "Procurement recovery import", actorRole: "system", summary: "Targeted schema support for a recovery draft ending at Item Description",
        afterState: { migration, source: manifest.source, checkpoint: manifest.checkpoint },
      }, { strict: true });
      const restored = await restoreProcurement(manifest, { reconstructProgression: values["reconstruct-progression"] });
      const repeated = await restoreProcurement(manifest, { reconstructProgression: values["reconstruct-progression"] });
      if (repeated.status !== "alreadyImported") throw new Error("Idempotency verification failed.");
      const preservation = await verifyRecoveryBaseline(baseline), auditAfter = await verifyChain();
      const previousProblems = new Set(auditBefore.problems.map((problem) => JSON.stringify(problem)));
      const newAuditProblems = auditAfter.problems.filter((problem) => !previousProblems.has(JSON.stringify(problem)));
      const allowed = new Set(["departments", "appentries", "prheaders", "prlineitems", "auditlogs", "recordfingerprints"]);
      const unexpectedTableChanges = Object.keys(preservation.rowCountChanges).filter((table) => !allowed.has(table));
      const app = await AppEntry.findByPk(restored.appEntryId);
      const pr = await PrHeader.findByPk(restored.prHeaderId);
      const item = await PrLineItem.findByPk(restored.lineItemId);
      const source = validateRecoveryManifest(manifest), v = source.values;
      const nativeMatches = app.projectTitle === v["Project Title"] && app.description === v["Project Description"] && app.categoryDetails === v["Procurement Category"] && app.category === source.category && Number(app.abc) === Number(source.abc) && app.fiscalYear === source.year && app.unit === v["Unit of Measure"] && app.quantity === source.quantity && app.fundSource === v["Fund Source"] && app.papCode === v["PAP Code"] && app.accountCode === v["MFO / Account Code"] && app.targetStartQuarter === source.quarters[0] && app.targetCompletionQuarter === source.quarters[1] && app.procurementMode === "competitiveBidding" && app.justificationStatus === "notApplicable" && pr.purpose === v["Purchase Requisition Purpose"] && pr.dateRequired === source.dateRequired && pr.isEmergency === false && pr.justificationStatus === "notApplicable" && item.description === v["Item Description"];
      const relationshipsValid = pr.appEntryId === app.id && pr.departmentId === app.implementingUnitId && item.prHeaderId === pr.id;
      const checkpointRespected = app.status === "draft" && app.planStage === "ppmp" && pr.status === "draft" && [item.technicalSpecifications, item.quantity, item.unit, item.unitCost, item.lineTotal, item.hasUsefulLifeOverOneYear, item.assetClass, pr.totalAmount, pr.submittedAt, pr.cashCertifiedAt, pr.mayorApprovedAt, pr.appropriationCertifiedAt, pr.fundsReservedAt, pr.modeDeterminedAt, app.modeRecommendedAt, app.lockedAt, app.postedAt, app.earlyProcurement].every((value) => value === null);
      const exactSourceFields = JSON.stringify(app.recoveryImport.sourceFields) === JSON.stringify(manifest.fields);
      // Native MySQL JSON normalizes object member order. Compare each field
      // rather than treating its serialization order as source content.
      const allSourceFieldsMatch = exactSourceFields || manifest.fields.every((field, index) => Object.entries(field).every(([key, value]) => app.recoveryImport.sourceFields[index]?.[key] === value));
      const verification = { ...preservation, unexpectedTableChanges, nativeFieldsMatch: nativeMatches, all28SourceFieldsMatch: allSourceFieldsMatch, relationshipsValid, checkpointRespected, idempotent: true, historicalTimestampsVerified: false, reconstructedEventsCreated: restored.status === "restored" ? app.recoveryImport.reconstructedProgression.length : 0, audit: { existingProblems: auditBefore.problems.length, retainedProblems: auditAfter.problems.length, newProblems: newAuditProblems, originalEntries: auditBefore.entriesChecked, entriesAfter: auditAfter.entriesChecked } };
      const report = { status: "completedWithMissingPrerequisites", ...previewResult, ...restored, backup, migration, verification, timestamps: { importedAt: restored.importedAt, appCreatedAt: app.createdAt, appUpdatedAt: app.updatedAt, prCreatedAt: pr.createdAt, itemCreatedAt: item.createdAt, originalCreatedAt: null, originalUpdatedAt: null, dateRequired: pr.dateRequired }, sourceFields: manifest.fields };
      const reportPath = path.join(directory, `recovery-report-${run}.json`);
      await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ ...report, sourceFields: undefined, reportPath }, null, 2));
      if (!preservation.existingRowsPreserved || unexpectedTableChanges.length || newAuditProblems.length || !nativeMatches || !allSourceFieldsMatch || !relationshipsValid || !checkpointRespected) throw new Error("Recovery verification found a discrepancy; inspect the private report before any further action.");
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await sequelize.close(); }
