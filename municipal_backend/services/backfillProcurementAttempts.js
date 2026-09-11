import { Rfq, Award } from "../models/biddingModel.js";
import { BacResolution } from "../models/bacResolutionModel.js";
import { ProcurementAttempt } from "../models/procurementAttemptModel.js";
import { Document, DOCUMENT_METADATA_ATTRIBUTES } from "../models/documentModel.js";
import { ensureProcurementAttempt, projectKeyFor, snapshotAttemptOutcome } from "./procurementGovernance.js";
import { withAuditTransaction } from "./auditLog.js";

// Idempotent additive registration. Existing attempts, bids, evaluations,
// resolutions and completed records are not edited. Only evidence that exists
// in the database is linked; absent historical approvals remain absent.
export const backfillProcurementAttempts = async () => {
  const rfqs = await Rfq.findAll({ order: [["createdAt", "ASC"], ["id", "ASC"]] });
  const seen = new Set();
  let imported = 0;
  for (const rfq of rfqs) {
    const projectKey = projectKeyFor(rfq);
    if (seen.has(projectKey)) continue;
    seen.add(projectKey);
    await withAuditTransaction(async (transaction, audit) => {
      const previous = await ProcurementAttempt.findAll({ where: { projectKey }, attributes: ["id"], transaction });
      const existingIds = new Set(previous.map((attempt) => attempt.id));
      await ensureProcurementAttempt(rfq, { transaction });
      const attempts = await ProcurementAttempt.findAll({ where: { projectKey }, transaction });
      const added = attempts.filter((attempt) => !existingIds.has(attempt.id));
      for (const attempt of added) {
        const record = rfqs.find((row) => row.id === attempt.rfqId);
        const award = record.status === "awarded" ? await Award.findOne({ where: { rfqId: record.id, status: ["issued", "accepted"] }, order: [["createdAt", "DESC"]], transaction }) : null;
        const resolution = await BacResolution.findOne({ where: award ? { entityRef: "award", entityId: award.id } : { entityRef: "rfq", entityId: record.id, type: "failureOfBidding" }, order: [["resolvedAt", "DESC"]], transaction });
        const documents = await Document.findAll({ where: { entityRef: "rfq", entityId: record.id }, attributes: DOCUMENT_METADATA_ATTRIBUTES, transaction });
        const snapshot = await snapshotAttemptOutcome(record, { transaction });
        await attempt.update({ outcomeSnapshot: { ...snapshot, legacyImported: true },
          ...(resolution ? { bacResolutionId: resolution.id } : {}),
          supportingDocuments: documents.map((document) => ({ documentId: document.id, name: document.filename, checksum: document.checksum, url: `/api/documents/${document.id}/download` })),
        }, { transaction });
      }
      if (added.length) await audit({ actionType: "bidding.attempt.historyImported", entityRef: "rfq", entityId: rfq.id,
        actorName: "Procurement workflow migration", summary: `${added.length} existing procurement attempt(s) registered`,
        afterState: { projectKey, attempts: added.map((attempt) => ({ id: attempt.id, rfqId: attempt.rfqId, attemptNumber: attempt.attemptNumber, status: attempt.status })) } });
      imported += added.length;
    });
  }
  return { imported };
};
