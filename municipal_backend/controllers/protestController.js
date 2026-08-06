import { Op } from "sequelize";
import {
  Protest,
  PROTEST_STAGES,
  RECONSIDERATION_FILING_DAYS,
  RECONSIDERATION_DECISION_DAYS,
  PROTEST_FILING_DAYS,
  PROTEST_DECISION_DAYS,
  protestFeeFor,
  decisionIsFinalAndExecutory,
} from "../models/protestModel.js";
import { Rfq, Award } from "../models/biddingModel.js";
import { Vendor } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { notifyByPermission, notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const calendarDays = (from, to) => Math.floor((new Date(to) - new Date(from)) / DAY_MS);

const serialize = (protest) => ({
  id: protest.id,
  stage: protest.stage,
  rfqId: protest.rfqId,
  referenceNo: protest.rfq?.referenceNo ?? null,
  challengedDecision: protest.challengedDecision,
  notifiedAt: protest.notifiedAt,
  filedAt: protest.filedAt,
  filingDays: protest.filingDays,
  filedOnTime: protest.filedOnTime,
  grounds: protest.grounds,
  verifiedByAffidavit: protest.verifiedByAffidavit,
  noForumShoppingCertified: protest.noForumShoppingCertified,
  protestFee: protest.protestFee === null ? null : Number(protest.protestFee),
  protestFeePaidAt: protest.protestFeePaidAt,
  protestFeeReference: protest.protestFeeReference,
  status: protest.status,
  decision: protest.decision,
  decidedAt: protest.decidedAt,
  dueAt: protest.dueAt,
  decidedLate: protest.decidedLate,
  finalAndExecutory: protest.finalAndExecutory,
  vendorName: protest.vendor?.businessName ?? null,
  filedByName: protest.filedBy?.name ?? null,
  decidedByName: protest.decidedBy?.name ?? null,
});

const withIncludes = {
  include: [
    { model: Rfq, as: "rfq" },
    { model: Vendor, as: "vendor" },
    { model: User, as: "filedBy", attributes: ["id", "name"] },
    { model: User, as: "decidedBy", attributes: ["id", "name"] },
  ],
};

// Sec. 84 — "Protests must first be resolved before any award is made." Every
// award path consults this, which is the whole point of having the mechanism.
export const unresolvedProtestsFor = (rfqId) =>
  Protest.findAll({ where: { rfqId, status: "filed" }, ...withIncludes });

export const getProtestOptions = async (req, res) => {
  const abc = Number(req.query.abc);
  res.json({
    stages: PROTEST_STAGES,
    periods: {
      reconsiderationFilingDays: RECONSIDERATION_FILING_DAYS,
      reconsiderationDecisionDays: RECONSIDERATION_DECISION_DAYS,
      protestFilingDays: PROTEST_FILING_DAYS,
      protestDecisionDays: PROTEST_DECISION_DAYS,
    },
    ...(Number.isFinite(abc) && abc > 0 ? { protestFee: protestFeeFor(abc) } : {}),
  });
};

export const listProtests = async (req, res) => {
  const where = {};
  if (req.query.rfqId) where.rfqId = Number(req.query.rfqId);
  if (req.query.status) where.status = req.query.status;

  // A bidder sees only their own.
  if (req.permissions.has("protest.file") && !req.permissions.has("protest.resolve")) {
    const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
    if (!vendor) return res.json([]);
    where.vendorId = vendor.id;
  }

  const protests = await Protest.findAll({ where, ...withIncludes, order: [["filedAt", "DESC"]] });
  res.json(protests.map(serialize));
};

// ── Stage 1: request for reconsideration to the BAC (Sec. 83.1) ──────────────
export const fileReconsideration = async (req, res) => {
  const { challengedDecision, notifiedAt, grounds } = req.body ?? {};

  const rfq = await Rfq.findByPk(req.params.rfqId);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });

  const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
  if (!vendor) return res.status(400).json({ message: "Complete your vendor registration first." });

  if (!challengedDecision?.trim()) {
    return res.status(400).json({ message: "State which decision of the BAC is being challenged." });
  }
  if (!grounds?.trim()) {
    return res.status(400).json({ message: "State the grounds for reconsideration." });
  }
  if (!notifiedAt || Number.isNaN(new Date(notifiedAt).getTime())) {
    return res.status(400).json({ message: "Record the date the BAC decision was notified to you." });
  }

  const filedAt = new Date();
  const filingDays = calendarDays(notifiedAt, filedAt);

  // Sec. 83.1 — three calendar days from receipt of written notice or verbal
  // notification. Late filings are recorded rather than rejected: whether to
  // entertain one is the BAC's call, and a refusal that leaves no trace is
  // exactly what a protest mechanism is supposed to prevent.
  const filedOnTime = filingDays <= RECONSIDERATION_FILING_DAYS;

  const protest = await Protest.create({
    stage: "requestForReconsideration",
    rfqId: rfq.id,
    vendorId: vendor.id,
    challengedDecision: challengedDecision.trim(),
    notifiedAt,
    filedAt,
    filingDays,
    filedOnTime,
    grounds: grounds.trim(),
    dueAt: new Date(filedAt.getTime() + RECONSIDERATION_DECISION_DAYS * DAY_MS),
    filedById: req.currentUser.id,
    status: "filed",
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.PROTEST_FILED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `${vendor.businessName} filed a request for reconsideration on ${rfq.referenceNo}`,
    afterState: { stage: "requestForReconsideration", filingDays, filedOnTime },
  });

  // Sec. 84 — no award may be made while this is pending, so the committee has
  // to know it exists.
  await notifyByPermission("protest.resolve", {
    type: NOTIFICATION_EVENTS.AWARD_RECOMMENDED,
    title: `Request for reconsideration — ${rfq.referenceNo}`,
    body:
      `${vendor.businessName} challenged: ${challengedDecision.trim()}. ` +
      `Decide within ${RECONSIDERATION_DECISION_DAYS} calendar days. No award may be made until it is resolved.`,
    link: "/protests",
    refEntity: "rfq",
    refId: rfq.id,
    severity: "warning",
  });

  res.status(201).json(serialize(await Protest.findByPk(protest.id, withIncludes)));
};

// ── Stage 2: protest to the HoPE (Sec. 83.2–83.3) ───────────────────────────
export const fileProtest = async (req, res) => {
  const { reconsiderationId, grounds, verifiedByAffidavit, noForumShoppingCertified, protestFeeReference } =
    req.body ?? {};

  // Guarded before the lookup: `findByPk(NaN)` reaches MySQL as a literal NaN
  // in the WHERE clause and comes back as a 500, which reads as a server fault
  // when it is a malformed request.
  const priorId = Number(reconsiderationId);
  if (!Number.isInteger(priorId) || priorId <= 0) {
    return res.status(400).json({
      message:
        "A protest must identify the request for reconsideration it follows. Sec. 83 allows a protest " +
        "only where reconsideration was first sought from the BAC and denied.",
    });
  }

  const reconsideration = await Protest.findByPk(priorId, withIncludes);
  if (!reconsideration || reconsideration.stage !== "requestForReconsideration") {
    return res.status(400).json({ message: "A prior request for reconsideration is required." });
  }

  // Sec. 83 — the protest lies only where reconsideration was sought AND denied.
  if (reconsideration.status === "filed") {
    return res.status(409).json({
      message: "The BAC has not yet resolved your request for reconsideration.",
    });
  }
  if (reconsideration.status !== "denied") {
    return res.status(409).json({
      message:
        `A protest lies only where the request for reconsideration was denied. Yours was ` +
        `"${reconsideration.status}".`,
    });
  }

  const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
  if (!vendor || vendor.id !== reconsideration.vendorId) {
    return res.status(403).json({ message: "This is not your request for reconsideration." });
  }

  // Sec. 83.3 — "An unverified position paper shall be considered unsigned,
  // produces no legal effect, and results in the outright dismissal of the
  // protest." And "Failure to comply... shall not be curable by mere amendment."
  if (!verifiedByAffidavit) {
    return res.status(400).json({
      message:
        "The position paper must be verified by an affidavit. An unverified paper produces no legal " +
        "effect and results in outright dismissal (RA 12009 Sec. 83.3).",
    });
  }
  if (!noForumShoppingCertified) {
    return res.status(400).json({
      message:
        "The bidder must certify under oath that no action or claim involving the same issues is " +
        "pending in any court, tribunal or quasi-judicial agency (RA 12009 Sec. 83.3).",
    });
  }
  if (!grounds?.trim()) {
    return res.status(400).json({ message: "The position paper must state the factual and legal bases." });
  }

  const rfq = reconsideration.rfq;
  const filedAt = new Date();
  const filingDays = calendarDays(reconsideration.decidedAt, filedAt);

  const fee = protestFeeFor(rfq.abc);
  if (!protestFeeReference?.trim()) {
    return res.status(402).json({
      message:
        `A protest must be accompanied by the non-refundable protest fee of ₱${fee.toLocaleString()} ` +
        `(RA 12009 Sec. 83.2). Record the payment reference.`,
      protestFee: fee,
    });
  }

  const protest = await Protest.create({
    stage: "protest",
    rfqId: rfq.id,
    vendorId: vendor.id,
    reconsiderationId: reconsideration.id,
    challengedDecision: reconsideration.challengedDecision,
    notifiedAt: reconsideration.decidedAt,
    filedAt,
    filingDays,
    // Sec. 83.2 — seven calendar days from receipt of the BAC's denial.
    filedOnTime: filingDays <= PROTEST_FILING_DAYS,
    grounds: grounds.trim(),
    verifiedByAffidavit: true,
    noForumShoppingCertified: true,
    protestFee: fee,
    protestFeePaidAt: new Date(),
    protestFeeReference: protestFeeReference.trim(),
    dueAt: new Date(filedAt.getTime() + PROTEST_DECISION_DAYS * DAY_MS),
    filedById: req.currentUser.id,
    status: "filed",
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.PROTEST_FILED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `${vendor.businessName} protested to the HoPE on ${rfq.referenceNo} (fee ₱${fee.toLocaleString()})`,
    afterState: { stage: "protest", filingDays, protestFee: fee },
  });

  await notifyByPermission("protest.decide", {
    type: NOTIFICATION_EVENTS.AWARD_RECOMMENDED,
    title: `Protest filed — ${rfq.referenceNo}`,
    body: `${vendor.businessName} protested the BAC's decision. Resolve within ${PROTEST_DECISION_DAYS} calendar days.`,
    link: "/protests",
    refEntity: "rfq",
    refId: rfq.id,
    severity: "danger",
  });

  res.status(201).json(serialize(await Protest.findByPk(protest.id, withIncludes)));
};

// ── Resolution (Sec. 83.1 for the BAC, Sec. 84 for the HoPE) ────────────────
export const resolveProtest = async (req, res) => {
  const { outcome, decision } = req.body ?? {};
  const protest = await Protest.findByPk(req.params.id, withIncludes);
  if (!protest) return res.status(404).json({ message: "Protest not found." });

  if (protest.status !== "filed") {
    return res.status(409).json({ message: `This has already been resolved: "${protest.status}".` });
  }
  if (!["granted", "denied", "dismissed"].includes(outcome)) {
    return res.status(400).json({ message: "Outcome must be granted, denied or dismissed." });
  }

  // Sec. 84.1 — the decision "shall clearly state the factual and legal bases
  // used to resolve the protest". A bare outcome is not a decision.
  if (!decision?.trim() || decision.trim().length < 30) {
    return res.status(400).json({
      message:
        "The decision must clearly state the factual and legal bases and cite the relevant portions of " +
        "the bidding documents or BAC resolutions (RA 12009 Sec. 84.1).",
    });
  }

  // The BAC decides requests for reconsideration; the HoPE decides protests.
  const requiredPermission =
    protest.stage === "requestForReconsideration" ? "protest.resolve" : "protest.decide";
  if (!req.permissions.has(requiredPermission)) {
    return res.status(403).json({
      message:
        protest.stage === "requestForReconsideration"
          ? "A request for reconsideration is decided by the BAC."
          : "A protest is decided by the Head of the Procuring Entity.",
    });
  }

  const decidedAt = new Date();
  const finalAndExecutory =
    protest.stage === "protest" &&
    decisionIsFinalAndExecutory(protest.rfq?.category, protest.rfq?.abc);

  await protest.update({
    status: outcome,
    decision: decision.trim(),
    decidedAt,
    decidedById: req.currentUser.id,
    decidedLate: decidedAt > new Date(protest.dueAt),
    finalAndExecutory,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.PROTEST_RESOLVED,
    entityRef: "rfq",
    entityId: protest.rfqId,
    summary:
      `${protest.stage === "protest" ? "Protest" : "Request for reconsideration"} on ` +
      `${protest.rfq?.referenceNo} ${outcome}`,
    beforeState: { status: "filed" },
    afterState: { status: outcome, finalAndExecutory, decidedLate: decidedAt > new Date(protest.dueAt) },
  });

  await notifyUsers([protest.filedById], {
    type: NOTIFICATION_EVENTS.BID_RESULT,
    title: `Your ${protest.stage === "protest" ? "protest" : "request for reconsideration"} was ${outcome}`,
    body:
      decision.trim().slice(0, 200) +
      (finalAndExecutory
        ? " This decision of the local chief executive is final and executory (RA 12009 Sec. 84.3)."
        : ""),
    link: "/supplier/opportunities",
    refEntity: "rfq",
    refId: protest.rfqId,
    severity: outcome === "granted" ? "success" : "warning",
  });

  res.json(serialize(await Protest.findByPk(protest.id, withIncludes)));
};
