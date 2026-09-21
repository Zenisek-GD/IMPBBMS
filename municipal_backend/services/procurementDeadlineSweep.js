import { Op } from "sequelize";
import { Rfq } from "../models/biddingModel.js";
import { withAuditTransaction } from "./auditLog.js";
import { ensureProcurementAttempt } from "./procurementGovernance.js";

// The submission endpoint enforces the exact instant even between sweeps.
// This records the elapsed deadline and advances the shared visible status.
export const closeExpiredProcurements = async ({ now = new Date(), limit = 100 } = {}) => {
  const candidates = await Rfq.findAll({ where: { status: "published", closingDate: { [Op.lte]: now } }, attributes: ["id"], order: [["closingDate", "ASC"]], limit });
  let closed = 0;
  for (const candidate of candidates) {
    closed += await withAuditTransaction(async (transaction, audit) => {
      const rfq = await Rfq.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE });
      // A concurrent approved amendment may have moved the deadline.
      if (!rfq || rfq.status !== "published" || new Date(rfq.closingDate) > now) return 0;
      const attempt = await ensureProcurementAttempt(rfq, { transaction });
      const context = { rfqId: rfq.id, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, closingDate: rfq.closingDate, detectedAt: now };
      await audit({ actionType: "rfq.deadlineReached", entityRef: "rfq", entityId: rfq.id, actorName: "Procurement deadline service", actorRole: "system", summary: "The approved bid submission deadline was reached.", afterState: context });
      await rfq.update({ status: "closed" }, { transaction });
      await audit({ actionType: "rfq.submissionsClosed", entityRef: "rfq", entityId: rfq.id, actorName: "Procurement deadline service", actorRole: "system", summary: "Submissions closed. The Secretariat may open bids at the approved opening time.", beforeState: { status: "published" }, afterState: { ...context, status: "closed" } });
      return 1;
    });
  }
  return { closed };
};

export const startProcurementDeadlineSweep = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await closeExpiredProcurements(); }
    catch (error) { console.error("[procurement] deadline processing failed:", error.name); }
    finally { running = false; }
  };
  const initial = setTimeout(run, 5000);
  const timer = setInterval(run, 60000);
  initial.unref?.(); timer.unref?.();
  return () => { clearTimeout(initial); clearInterval(timer); };
};
