import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { AppEntry, Award, Bid, PrHeader, PrLineItem, Rfq, sequelize } from "../models/index.js";
import { RecordFingerprint } from "../models/integrityModel.js";
import { withAuditTransaction } from "../services/auditLog.js";
import { fingerprintOf } from "../services/integrityMonitor.js";
import { validDateOnly } from "../services/procurementInformation.js";

const [form2025, form2026, mode] = process.argv.slice(2);
assert.ok(form2025 && form2026 && [undefined, "--apply"].includes(mode), "Pass the two reviewed DOCX paths and optionally --apply.");
assert.equal(sequelize.config.host, "127.0.0.1");
assert.equal(sequelize.config.database, "municipal_backend");

function readForm(filename) {
  const path = resolve(filename);
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  const projects = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($env:PROCUREMENT_REVIEWED_SOURCE)
    try {
      $stream = $zip.GetEntry('word/document.xml').Open()
      $reader = [Xml.XmlReader]::Create($stream)
      try { $doc = [Xml.XmlDocument]::new(); $doc.Load($reader) } finally { $reader.Dispose(); $stream.Dispose() }
      $ns = [Xml.XmlNamespaceManager]::new($doc.NameTable)
      $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
      if ($doc.SelectSingleNode('//w:ins|//w:del|//w:moveFrom|//w:moveTo', $ns)) { throw 'Resolve tracked changes before reconciliation.' }
      $projects = [Collections.Generic.List[object]]::new()
      foreach ($row in $doc.SelectNodes('/w:document/w:body/w:tbl/w:tr', $ns)) {
        $cells = @($row.SelectNodes('w:tc', $ns))
        if ($cells.Count -ne 2) { continue }
        $label, $value = foreach ($cell in $cells) {
          (($cell.SelectNodes('.//w:t', $ns) | ForEach-Object InnerText) -join '').Trim()
        }
        if ($label -eq 'Fiscal Year') { $fields = [Collections.Generic.List[object]]::new(); $projects.Add($fields) }
        if ($projects.Count -and $label) { $fields.Add(@{ label = $label; value = $value }) }
      }
      ConvertTo-Json -InputObject $projects -Depth 6 -Compress
    } finally { $zip.Dispose() }
  `], { encoding: "utf8", env: { ...process.env, PROCUREMENT_REVIEWED_SOURCE: path } }));
  return { filename: basename(path), sha256, projects };
}

function sourceDate(value, time) {
  assert.match(value, /^[A-Za-z]+ \d{1,2}, \d{4}$/);
  const date = new Date(`${value} ${time ?? "12:00 PM"} GMT+0800`);
  if (time) return date.toISOString();
  const day = date.toISOString().slice(0, 10);
  assert.ok(validDateOnly(day));
  return day;
}

function peso(value) {
  assert.match(value, /^PHP [\d,]+\.\d{2}$/);
  return value.slice(4).replaceAll(",", "");
}

const expected = new Set(["GSO-2025-001", "MICTO-2025-002", "MEO-2025-003", "MDRRMO-2026-001"]);
try {
  const forms = [readForm(form2025), readForm(form2026)];
  assert.deepEqual(forms.map((form) => form.projects.length), [3, 1]);
  const changes = await withAuditTransaction(async (transaction, audit) => {
    const lock = { transaction, lock: transaction.LOCK.UPDATE };
    const results = [];
    for (const { filename, sha256, projects } of forms) for (const fields of projects) {
      const source = Object.fromEntries(fields.map(({ label, value }) => [label, value]));
      assert.equal(Object.keys(source).length, fields.length, "Resolve duplicate field labels before reconciliation.");
      const code = source["PAP Code"];
      assert.ok(expected.delete(code), "Unexpected or repeated project code in the reviewed forms.");
      const apps = await AppEntry.findAll({ where: { papCode: code }, ...lock });
      assert.equal(apps.length, 1, `Expected one existing project for ${code}.`);
      const [app] = apps;
      const recovery = app.recoveryImport;
      assert.equal(app.fiscalYear, Number(source["Fiscal Year"]));
      assert.equal(app.projectTitle, source["Project Title"]);
      assert.equal(Number(app.abc), Number(peso(source["Approved Budget for the Contract"])));
      assert.equal(recovery.sourceStatus, source.Status);
      const prs = await PrHeader.findAll({ where: { appEntryId: app.id }, ...lock });
      assert.equal(prs.length, 1);
      const [pr] = prs;
      assert.equal(pr.departmentId, app.implementingUnitId);
      assert.equal(pr.dateRequired, sourceDate(source["Date Required"]));

      const entities = [];
      const update = async (row, entityRef, values, fingerprinted = false) => {
        entities.push(entityRef);
        if (mode !== "--apply") return;
        const fingerprint = fingerprinted ? await RecordFingerprint.findOne({ where: { entityRef, entityId: row.id }, ...lock }) : null;
        if (fingerprinted) assert.equal(fingerprint?.fingerprint, fingerprintOf(entityRef, row));
        const auditValues = (state) => {
          if (entityRef !== "appEntry") return state;
          const form = state.recoveryImport?.reviewedForm;
          return { reviewedForm: form ? { filename: form.filename, sha256: form.sha256, fieldCount: form.fields.length, recordedAt: form.recordedAt } : null };
        };
        const beforeState = auditValues(Object.fromEntries(Object.keys(values).map((key) => [key, row[key]])));
        await row.update(values, { transaction });
        const event = await audit({
          actionType: "data.recovery.reviewedForm", entityRef, entityId: row.id,
          actorName: "Local procurement records reconciliation", actorRole: "system",
          summary: `Reconciled ${code} against the reviewed client form.`,
          beforeState, afterState: { ...auditValues(values), appEntryId: app.id, source: { filename, sha256 } },
        });
        if (fingerprint) await fingerprint.update({ fingerprint: fingerprintOf(entityRef, row), lastAuditSequence: event.sequence }, { transaction });
      };
      const reviewedForm = { filename, sha256, fields, recordedAt: new Date().toISOString() };
      if (app.fiscalYear === 2025) {
        const award = await Award.findByPk(recovery.historicalAward.id, lock);
        const rfq = await Rfq.findByPk(award.rfqId, lock);
        assert.equal(rfq.appEntryId, app.id);
        assert.equal(rfq.prHeaderId, pr.id);
        assert.equal(award.noaNumber, source["Existing Notice of Award Number"]);
        assert.equal(award.noaDate, sourceDate(source["Notice of Award Date"]));
        assert.equal(award.supplierReceivedAt, sourceDate(source["Supplier Receipt Date"]));
        assert.equal(Number(award.amount), Number(peso(source["Recommended Award Amount"])));
        if (award.bidId) assert.equal((await Bid.findByPk(award.bidId, lock)).rfqId, rfq.id);
      } else {
        assert.equal(code, "MDRRMO-2026-001");
        const award = {
          noaNumber: source["Existing Notice of Award Number"], noaDate: sourceDate(source["Notice of Award Date"]),
          amount: Number(peso(source["Recommended Award Amount"])), recommendedSupplier: source["Award Recommended Supplier"],
          resolutionNumber: source["BAC Resolution Number"], supplierReceivedAt: sourceDate(source["Supplier Receipt Date"]),
        };
        const [, date, time] = /^Yes\s*[–-]\s*([A-Za-z]+ \d{1,2}, \d{4}), (\d{1,2}:\d{2} [AP]M)$/.exec(source["Pre-Bid Conference"]);
        const opening = sourceDate(source["Bid Opening Date"], source["Bid Opening Time"]);
        const closing = sourceDate(source["Closing Date"], source["Closing Time"]);
        const prebid = sourceDate(date, time);
        const submission = sourceDate(source["Submission Date"]);
        assert.ok(prebid <= closing && closing <= opening);
        assert.ok(submission <= sourceDate(source["Closing Date"]) && sourceDate(source["Bid Opening Date"]) <= award.noaDate && award.noaDate <= award.supplierReceivedAt);
        reviewedForm.award = award;
        reviewedForm.milestones = [
          { date: prebid, action: "Pre-bid conference schedule", stage: "solicitation" },
          { date: submission, action: "Bid submission reported", stage: "bidding" },
          { date: closing, action: "Bid submission deadline", stage: "bidding" },
          { date: opening, action: "Bid opening schedule", stage: "bidding" },
          { date: award.noaDate, action: "Notice of Award reported", stage: "award" },
          { date: award.supplierReceivedAt, action: "Supplier receipt reported", stage: "award" },
        ];
        // Leave the requisition's status, authority and identifiers intact.
        const items = await PrLineItem.findAll({ where: { prHeaderId: pr.id }, ...lock });
        const [item] = items;
        if (recovery.hold && pr.status === "draft" && items.length === 1 && item.description === source["Item Description"]) {
          const quantity = Number(source["Item Quantity"]), unitCost = peso(source["Estimated Unit Cost"]);
          assert.equal(quantity, 1);
          assert.equal(source["Useful Life Exceeds One Year"], "Yes");
          const candidate = { technicalSpecifications: source["Technical Specifications"], unit: source["Item Unit of Measure"], quantity, unitCost, lineTotal: unitCost, hasUsefulLifeOverOneYear: true };
          const blanks = Object.fromEntries(Object.entries(candidate).filter(([key]) => item[key] == null));
          for (const [key, value] of Object.entries(candidate)) {
            if (item[key] == null) continue;
            const normalize = ["quantity", "unitCost", "lineTotal"].includes(key) ? Number : (input) => input;
            assert.equal(normalize(item[key]), normalize(value), `Conflicting requisition value for ${key}.`);
          }
          if (Object.keys(blanks).length) await update(item, "prLineItem", blanks);
          if (pr.totalAmount == null) await update(pr, "purchaseRequisition", { totalAmount: unitCost }, true);
        }
      }
      if (recovery.reviewedForm?.sha256 !== sha256) await update(app, "appEntry", { recoveryImport: { ...recovery, reviewedForm } }, true);
      results.push({ code, projectId: app.id, fieldCount: fields.length, entities });
    }
    assert.equal(expected.size, 0);
    return results;
  });
  console.log(JSON.stringify({ applied: mode === "--apply", changes }, null, 2));
} finally {
  await sequelize.close();
}
