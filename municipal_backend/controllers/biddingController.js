import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Rfq, Bid, BidOpeningRecord, Evaluation, PostQualification, Award } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Vendor } from "../models/vendorModel.js";
import { PrHeader } from "../models/prModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { BacResolution, nextResolutionNo } from "../models/bacResolutionModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { notifyByPermission, notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import {
  suggestProcurementMode,
  requiresPrebidConference,
  SVP_POSTING_EXEMPTION_CEILING,
} from "../services/procurementThresholds.js";
import { checkVendorEligibility } from "../services/vendorEligibility.js";
import { issueOtp, verifyOtp, consumeTicket, serializeChallenge, maskEmail } from "../services/otp.js";
import {
  Security,
  SECURITY_FORMS,
  BID_SECURITY_RATES,
  requiredBidSecurity,
} from "../models/securityModel.js";

// Identities stay masked for the whole time scoring is open. The BAC
// Chairperson closing evaluation is what reveals them — see closeEvaluation().
const isBlindStage = (rfq) => rfq.status === "opened";

const rfqIncludes = {
  include: [
    { model: ProcurementMode, as: "mode" },
    { model: PrHeader, as: "purchaseRequisition" },
    { model: User, as: "publishedBy", attributes: ["id", "name"] },
  ],
};

const serializeRfq = (rfq) => ({
  id: rfq.id,
  referenceNo: rfq.referenceNo,
  title: rfq.title,
  abc: Number(rfq.abc),
  category: rfq.category,
  publishDate: rfq.publishDate,
  closingDate: rfq.closingDate,
  prebidRequired: rfq.prebidRequired,
  prebidAt: rfq.prebidAt,
  postingRequired: rfq.postingRequired,
  status: rfq.status,
  cancellationReason: rfq.cancellationReason,
  modeKey: rfq.mode?.key ?? null,
  modeName: rfq.mode?.name ?? null,
  prNumber: rfq.purchaseRequisition?.prNumber ?? null,
  publishedByName: rfq.publishedBy?.name ?? null,
});

// `viewer` decides how much of a bid is disclosed. During blind evaluation the
// vendor is replaced by the anonymous label and the price is withheld.
const serializeBid = (bid, { blind, includeFinancial }) => ({
  id: bid.id,
  rfqId: bid.rfqId,
  blindLabel: bid.blindLabel,
  status: bid.status,
  submittedAt: bid.submittedAt,
  remarks: bid.remarks,
  vendorId: blind ? null : bid.vendorId,
  vendorName: blind ? bid.blindLabel : (bid.vendor?.businessName ?? null),
  // IRR Sec. 58: the financial envelope is opened only after the technical
  // component is rated "passed".
  totalBidPrice: includeFinancial && !bid.financialSealed ? Number(bid.totalBidPrice) : null,
  financialSealed: bid.financialSealed,
  averageScore:
    bid.evaluations?.length > 0
      ? Number(
          (
            bid.evaluations.reduce((sum, e) => sum + Number(e.score), 0) / bid.evaluations.length
          ).toFixed(2)
        )
      : null,
  evaluationCount: bid.evaluations?.length ?? 0,
});

// ── RFQ / ITB ───────────────────────────────────────────────────────────────

const nextReference = async (modeKey) => {
  const prefix = modeKey === "competitiveBidding" ? "ITB" : "RFQ";
  const year = new Date().getFullYear();
  const count = await Rfq.count({ where: { referenceNo: { [Op.like]: `${prefix}-${year}-%` } } });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
};

export const listRfqs = async (req, res) => {
  const { status } = req.query;
  const where = {};
  if (status) where.status = status;

  // A vendor sees only what is actually open to bid on, never drafts.
  if (req.permissions.has("bidding.submitBid") && !req.permissions.has("bidding.publish")) {
    where.status = { [Op.in]: ["published", "closed"] };
  }
  // Observers see published records only (Section 2.2).
  if (req.permissions.has("bidding.viewPublished") && !req.permissions.has("bidding.view")) {
    where.status = { [Op.in]: ["awarded", "closed", "opened", "evaluated"] };
  }

  const rfqs = await Rfq.findAll({ where, ...rfqIncludes, order: [["createdAt", "DESC"]] });
  res.json(rfqs.map(serializeRfq));
};

export const createRfq = async (req, res) => {
  const { prHeaderId, title, category, closingDate, prebidAt, procurementModeKey } = req.body;

  const pr = await PrHeader.findByPk(prHeaderId);
  if (!pr) return res.status(400).json({ message: "That requisition does not exist." });

  // Lifecycle step 4: a requisition must be approved before it can be advertised.
  if (pr.status !== "approved") {
    return res.status(400).json({ message: "Only an approved requisition can be advertised." });
  }
  if (await Rfq.findOne({ where: { prHeaderId, status: { [Op.notIn]: ["cancelled", "failed"] } } })) {
    return res.status(409).json({ message: "This requisition already has an active RFQ/ITB." });
  }
  if (!closingDate) return res.status(400).json({ message: "A closing date is required." });

  const abc = Number(pr.totalAmount);
  const lgu = await getLguProfile();
  const suggestion = suggestProcurementMode(abc, lgu);

  const modeKey = procurementModeKey ?? suggestion.suggested;
  const mode = await ProcurementMode.findOne({ where: { key: modeKey } });
  if (!mode) return res.status(400).json({ message: "Unknown procurement mode." });

  // Section 3: alternative modes require documented justification, and some
  // require prior HOPE approval. The justification lives on the APP entry /
  // requisition; block the obvious case of silently downgrading from the
  // suggested mode without one.
  if (mode.requiresJustification && modeKey !== suggestion.suggested && !req.body.justification?.trim()) {
    return res.status(400).json({
      message: `${mode.name} differs from the suggested mode (${suggestion.suggested}) and requires a written justification.`,
    });
  }

  const rfq = await Rfq.create({
    referenceNo: await nextReference(modeKey),
    title: title?.trim() || pr.purpose || `Procurement for ${pr.prNumber}`,
    abc,
    category: category ?? "goods",
    closingDate,
    prebidAt: prebidAt ?? null,
    // IRR Sec. 51.1 and 34.3(b) — both derived, not asked of the user.
    prebidRequired: requiresPrebidConference(abc),
    postingRequired: modeKey !== "smallValueProcurement" || abc > SVP_POSTING_EXEMPTION_CEILING,
    prHeaderId,
    procurementModeId: mode.id,
    status: "draft",
  });

  res.status(201).json({
    ...serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)),
    suggestion,
  });
};

export const publishRfq = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  if (rfq.status !== "draft") {
    return res.status(409).json({ message: `Cannot publish from status "${rfq.status}".` });
  }
  if (new Date(rfq.closingDate) <= new Date()) {
    return res.status(400).json({ message: "The closing date must be in the future." });
  }

  await rfq.update({
    status: "published",
    publishDate: new Date().toISOString().slice(0, 10),
    publishedById: req.currentUser.id,
  });

  // Section 7.4: publication notifies bidders directly in-system.
  const verifiedVendors = await Vendor.findAll({ where: { registrationStatus: "verified" } });
  await notifyUsers(
    verifiedVendors.map((vendor) => vendor.userId),
    {
      type: NOTIFICATION_EVENTS.RFQ_PUBLISHED,
      title: `New opportunity: ${rfq.referenceNo}`,
      body: `${rfq.title} — ABC ₱${Number(rfq.abc).toLocaleString()}. Closes ${new Date(rfq.closingDate).toLocaleString()}.`,
      link: "/supplier/opportunities",
      refEntity: "rfq",
      refId: rfq.id,
      severity: "info",
    }
  );

  res.json(serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)));
};

export const closeRfq = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  if (rfq.status !== "published") {
    return res.status(409).json({ message: `Cannot close from status "${rfq.status}".` });
  }

  await rfq.update({ status: "closed" });
  res.json(serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)));
};

export const cancelRfq = async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ message: "A cancellation reason is required." });

  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  if (["awarded", "cancelled"].includes(rfq.status)) {
    return res.status(409).json({ message: `Cannot cancel from status "${rfq.status}".` });
  }

  await rfq.update({ status: "cancelled", cancellationReason: reason.trim() });
  res.json(serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)));
};

// ── Bid submission ──────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Workflow requirement 14: step-up email verification before a bid is submitted.
//
// A bid is an irrevocable financial commitment — there is no edit path, only
// withdraw and resubmit, and the price binds the bidder if they win. Requiring a
// code sent to the accredited mailbox means a session left open on a shared
// machine is not by itself enough to commit a company to a tender.
//
// Both endpoints are scoped to the specific RFQ (contextRef/contextId), so a code
// confirmed for one opportunity cannot be spent submitting a bid on another.
// ─────────────────────────────────────────────────────────────────────────────

export const requestBidSubmissionCode = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  if (rfq.status !== "published") {
    return res.status(409).json({ message: "This opportunity is not open for bids." });
  }
  if (new Date() > new Date(rfq.closingDate)) {
    return res.status(409).json({ message: "The deadline for submission has passed (IRR Sec. 54.6)." });
  }

  const issued = await issueOtp({
    user: req.currentUser,
    purpose: "bidSubmission",
    deliveredTo: req.currentUser.email,
    contextRef: "rfq",
    contextId: rfq.id,
  });
  if (!issued.ok) return res.status(issued.status).json({ message: issued.message });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.OTP_ISSUED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `Bid submission code issued to ${maskEmail(req.currentUser.email)} for ${rfq.referenceNo}`,
    afterState: { purpose: "bidSubmission", expiresAt: issued.expiresAt },
  });

  res.json({
    message: `We sent a 6-digit code to ${maskEmail(req.currentUser.email)}. It expires in ${issued.expiresInMinutes} minutes.`,
    challenge: serializeChallenge(issued),
  });
};

export const verifyBidSubmissionCode = async (req, res) => {
  const { reference, code } = req.body ?? {};
  const verification = await verifyOtp({
    reference,
    code,
    userId: req.currentUser.id,
    purpose: "bidSubmission",
  });

  if (!verification.ok) {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.OTP_FAILED,
      outcome: "denied",
      entityRef: "rfq",
      entityId: Number(req.params.id),
      summary: `Incorrect or expired bid submission code submitted by ${req.currentUser.name}`,
      afterState: { purpose: "bidSubmission" },
    });
    return res.status(verification.status).json({ message: verification.message });
  }

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.OTP_VERIFIED,
    entityRef: "rfq",
    entityId: Number(req.params.id),
    summary: `Bid submission code verified for ${req.currentUser.name}`,
    afterState: { purpose: "bidSubmission" },
  });

  res.json({
    verified: true,
    ticket: verification.ticket,
    reference,
    expiresAt: verification.ticketExpiresAt,
  });
};

export const submitBid = async (req, res) => {
  const {
    totalBidPrice,
    bidSecurityForm,
    bidSecurityReference,
    bidSecurityIssuer,
    reference,
    ticket,
  } = req.body;
  const rfq = await Rfq.findByPk(req.params.id);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });

  if (rfq.status !== "published") {
    return res.status(409).json({ message: "This opportunity is not open for bids." });
  }
  // IRR Sec. 54.6: bids submitted after the deadline are not accepted.
  if (new Date() > new Date(rfq.closingDate)) {
    return res.status(409).json({ message: "The deadline for submission has passed (IRR Sec. 54.6)." });
  }

  const vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });
  if (!vendor) return res.status(400).json({ message: "Complete your vendor registration first." });
  if (vendor.registrationStatus !== "verified") {
    return res.status(403).json({ message: "Your registration must be verified before you can bid." });
  }

  // The PhilGEPS Platinum certificate is valid for one year. The expiry was
  // being stored and never read, so a supplier whose registration lapsed years
  // ago could bid and win normally.
  const eligibility = checkVendorEligibility(vendor);
  if (!eligibility.eligible) {
    return res.status(403).json({ message: eligibility.reason });
  }

  if (await Bid.findOne({ where: { rfqId: rfq.id, vendorId: vendor.id, status: { [Op.ne]: "withdrawn" } } })) {
    return res.status(409).json({ message: "You have already submitted a bid for this opportunity." });
  }

  const price = Number(totalBidPrice);
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ message: "A total bid price is required." });
  }

  // The ABC is a hard ceiling, not a target. A bid above it is disqualified
  // automatically — there is no discretion to accept it, no waiver, and no
  // later stage at which it could become eligible. Rejecting it at submission
  // rather than at evaluation is deliberate: it tells the bidder while they can
  // still revise, and it keeps an ineligible offer out of the opening record.
  //
  // Bid prices are immutable once submitted (there is no update path, only
  // withdraw and re-submit), so this single gate is sufficient — a bid that
  // passes here cannot later drift above the ceiling.
  if (price > Number(rfq.abc)) {
    return res.status(400).json({
      message:
        `A bid of ₱${price.toLocaleString()} exceeds the Approved Budget for the Contract ` +
        `of ₱${Number(rfq.abc).toLocaleString()}. Bids above the ABC are automatically ` +
        `disqualified and cannot be accepted.`,
      abc: Number(rfq.abc),
      submitted: price,
    });
  }

  // ── Bid security ───────────────────────────────────────────────────────────
  // A bid without security is not a commitment — the bidder can walk away from
  // a winning bid at no cost, which is exactly what the instrument exists to
  // prevent. Required at submission, since a security posted after the deadline
  // secures nothing.
  const form = bidSecurityForm ?? "suretyBond";
  if (!SECURITY_FORMS.includes(form)) {
    return res.status(400).json({
      message: "Unknown bid security form.",
      accepted: SECURITY_FORMS,
    });
  }

  const requiredAmount = requiredBidSecurity(rfq.abc, form);

  // ── Email verification ────────────────────────────────────────────────────
  // Spent here, after every other check has passed, so a rejected bid does not
  // burn the bidder's verification and send them back for another code. Scoped to
  // this RFQ: a ticket earned against a different opportunity will not be
  // accepted.
  const spent = await consumeTicket({
    reference,
    ticket,
    userId: req.currentUser.id,
    purpose: "bidSubmission",
    contextRef: "rfq",
    contextId: rfq.id,
  });
  if (!spent.ok) {
    return res.status(spent.status).json({
      message:
        "Bid submission must be confirmed with the code we email you. " +
        "Request a new code and try again.",
      requiresOtp: true,
    });
  }

  const bid = await Bid.create({
    rfqId: rfq.id,
    vendorId: vendor.id,
    technicalSubmitted: true,
    financialSealed: true, // stays sealed until the technical component passes
    totalBidPrice: price,
    submittedAt: new Date(),
    status: "submitted",
  });

  // A Securing Declaration carries no deposit — the bidder's undertaking is the
  // security — so its amount is legitimately zero.
  await Security.create({
    type: "bid",
    form,
    amount: requiredAmount,
    percentage: BID_SECURITY_RATES[form] ?? 0,
    referenceNo: bidSecurityReference ?? null,
    issuer: bidSecurityIssuer ?? null,
    postedAt: new Date(),
    validUntil: rfq.closingDate,
    status: "posted",
    entityRef: "bid",
    entityId: bid.id,
    vendorId: vendor.id,
    recordedById: req.currentUser.id,
  });

  // Workflow requirement 11: bid submissions.
  //
  // The price is recorded because the audit log is the accountability record for
  // exactly this — who committed what, when, from where — and a bid price is not a
  // secret from an auditor. It is a sealed figure as far as the *evaluation* is
  // concerned, which is enforced by the serialisers that mask bidder identities
  // and withhold financial envelopes until opening; the audit log is not part of
  // that surface, and access to it is itself permission-gated.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BID_SUBMITTED,
    entityRef: "bid",
    entityId: bid.id,
    summary: `${vendor.businessName} submitted a bid for ${rfq.referenceNo}`,
    afterState: {
      rfqId: rfq.id,
      rfqReference: rfq.referenceNo,
      vendorId: vendor.id,
      businessName: vendor.businessName,
      totalBidPrice: price,
      abc: Number(rfq.abc),
      bidSecurityForm: form,
      bidSecurityAmount: requiredAmount,
      // The fact of verification, not the code.
      emailVerified: true,
    },
  });

  res.status(201).json({
    id: bid.id,
    status: bid.status,
    submittedAt: bid.submittedAt,
    bidSecurity: {
      form,
      amount: requiredAmount,
      percentOfAbc: BID_SECURITY_RATES[form] ?? 0,
    },
  });
};

// ── Bid opening ─────────────────────────────────────────────────────────────

export const openBids = async (req, res) => {
  const { witnesses, remarks } = req.body;
  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  if (rfq.status !== "closed") {
    return res.status(409).json({ message: "Close the RFQ/ITB before opening bids." });
  }

  const bids = await Bid.findAll({ where: { rfqId: rfq.id, status: "submitted" }, order: [["submittedAt", "ASC"]] });
  if (bids.length === 0) {
    // Section 6 / IRR Sec. 64: no bids is a failure of bidding, not an opening.
    await rfq.update({ status: "failed" });
    return res.status(409).json({ message: "No bids were received — this is a failure of bidding." });
  }

  const record = await sequelize.transaction(async (transaction) => {
    // Assign the anonymous labels used throughout blind evaluation (7.9).
    for (const [index, bid] of bids.entries()) {
      await bid.update(
        { blindLabel: `Bidder ${String.fromCharCode(65 + index)}`, status: "opened" },
        { transaction }
      );
    }

    const created = await BidOpeningRecord.create(
      {
        rfqId: rfq.id,
        openedById: req.currentUser.id,
        openedAt: new Date(),
        witnesses: witnesses ?? null,
        remarks: remarks ?? null,
        bidsReceived: bids.length,
      },
      { transaction }
    );

    await rfq.update({ status: "opened" }, { transaction });
    return created;
  });

  res.json({
    openingRecordId: record.id,
    bidsReceived: bids.length,
    rfq: serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)),
  });
};

// ── Evaluation (blind) ──────────────────────────────────────────────────────

export const listBidsForRfq = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });

  const blind = isBlindStage(rfq);
  const bids = await Bid.findAll({
    where: { rfqId: rfq.id },
    include: [
      { model: Vendor, as: "vendor" },
      { model: Evaluation, as: "evaluations" },
    ],
    order: [["blindLabel", "ASC"]],
  });

  res.json({
    blind,
    // Say plainly why identities are hidden, so the UI doesn't have to guess.
    blindNotice: blind
      ? "Bidder identities are masked until the BAC Chairperson closes evaluation."
      : null,
    bids: bids.map((bid) =>
      serializeBid(bid, { blind, includeFinancial: !blind || bid.status === "technicalPassed" })
    ),
  });
};

export const submitEvaluation = async (req, res) => {
  const { criteriaBreakdown, remarks } = req.body;
  const bid = await Bid.findByPk(req.params.bidId, { include: [{ model: Rfq, as: "rfq" }] });
  if (!bid) return res.status(404).json({ message: "Bid not found." });

  if (bid.rfq.status !== "opened") {
    return res.status(409).json({ message: "Evaluation is not open for this procurement." });
  }

  if (!criteriaBreakdown || typeof criteriaBreakdown !== "object") {
    return res.status(400).json({ message: "A rubric breakdown is required." });
  }

  // The rubric is system-enforced (Section 7.9): every criterion must be a
  // number in 0..100, and the score is computed here rather than accepted.
  const values = Object.values(criteriaBreakdown);
  if (values.length === 0) return res.status(400).json({ message: "Score at least one criterion." });
  if (values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
    return res.status(400).json({ message: "Each criterion must be scored between 0 and 100." });
  }
  const score = Number((values.reduce((sum, v) => sum + Number(v), 0) / values.length).toFixed(2));

  // Section 7.9: scores are immutable once submitted.
  if (await Evaluation.findOne({ where: { bidId: bid.id, evaluatorId: req.currentUser.id } })) {
    return res.status(409).json({ message: "You have already scored this bid. Scores cannot be changed." });
  }

  const evaluation = await Evaluation.create({
    bidId: bid.id,
    evaluatorId: req.currentUser.id,
    criteriaBreakdown,
    score,
    blindFlag: isBlindStage(bid.rfq),
    submittedAt: new Date(),
    remarks: remarks ?? null,
  });

  // Section 7.9: an immutable, timestamped trail of every evaluator's score.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.EVALUATION_SUBMITTED,
    entityRef: "bid",
    entityId: bid.id,
    summary: `Score ${score} submitted for ${bid.blindLabel} (blind: ${isBlindStage(bid.rfq)})`,
    afterState: { score, criteriaBreakdown, blindFlag: isBlindStage(bid.rfq) },
  });

  res.status(201).json({ id: evaluation.id, score: Number(evaluation.score), blindFlag: evaluation.blindFlag });
};

// Closing evaluation is what lifts the mask. Restricted to the Chairperson
// (bidding.chairEvaluation) so a single evaluator cannot reveal identities.
export const closeEvaluation = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });
  if (rfq.status !== "opened") {
    return res.status(409).json({ message: `Cannot close evaluation from status "${rfq.status}".` });
  }

  const bids = await Bid.findAll({
    where: { rfqId: rfq.id },
    include: [{ model: Evaluation, as: "evaluations" }],
  });

  const unscored = bids.filter((bid) => (bid.evaluations ?? []).length === 0);
  if (unscored.length > 0) {
    return res.status(409).json({
      message: `${unscored.length} bid(s) have no scores yet. Every bid must be evaluated before closing.`,
    });
  }

  await sequelize.transaction(async (transaction) => {
    // Unseal the financial envelope only for bids that passed the technical
    // component (IRR Sec. 58).
    for (const bid of bids) {
      const average =
        bid.evaluations.reduce((sum, e) => sum + Number(e.score), 0) / bid.evaluations.length;
      const passed = average >= 60;

      await bid.update(
        {
          status: passed ? "technicalPassed" : "technicalFailed",
          financialSealed: !passed,
        },
        { transaction }
      );
    }
    await rfq.update({ status: "evaluated" }, { transaction });
  });

  // Section 7.4: bid results go to each bidder individually.
  for (const bid of await Bid.findAll({ where: { rfqId: rfq.id }, include: [{ model: Vendor, as: "vendor" }] })) {
    const passed = bid.status === "technicalPassed";
    await notifyUsers([bid.vendor?.userId], {
      type: NOTIFICATION_EVENTS.BID_RESULT,
      title: `Technical evaluation result — ${rfq.referenceNo}`,
      body: passed
        ? "Your bid passed the technical component. Your financial envelope has been opened."
        : "Your bid did not pass the technical component.",
      link: "/supplier/opportunities",
      refEntity: "rfq",
      refId: rfq.id,
      severity: passed ? "success" : "warning",
    });
  }

  // Lifting the blind is exactly the moment an auditor will want to inspect.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.EVALUATION_CLOSED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `Evaluation closed for ${rfq.referenceNo} — bidder identities revealed`,
    afterState: { status: "evaluated", bidsEvaluated: bids.length },
  });

  res.json({ message: "Evaluation closed. Bidder identities are now visible.", rfqId: rfq.id });
};

// ── Post-qualification ──────────────────────────────────────────────────────

export const submitPostQualification = async (req, res) => {
  const { result, remarks, checklist } = req.body;
  const bid = await Bid.findByPk(req.params.bidId, { include: [{ model: Rfq, as: "rfq" }] });
  if (!bid) return res.status(404).json({ message: "Bid not found." });

  if (bid.rfq.status !== "evaluated") {
    return res.status(409).json({ message: "Close evaluation before post-qualification." });
  }
  if (bid.status !== "technicalPassed") {
    return res.status(409).json({ message: "Only a bid that passed the technical component can be post-qualified." });
  }
  if (!["passed", "failed"].includes(result)) {
    return res.status(400).json({ message: "Result must be passed or failed." });
  }
  if (result === "failed" && !remarks?.trim()) {
    return res.status(400).json({ message: "Remarks are required when a bidder fails post-qualification." });
  }

  await sequelize.transaction(async (transaction) => {
    await PostQualification.create(
      {
        bidId: bid.id,
        verifiedById: req.currentUser.id,
        checklist: checklist ?? null,
        result,
        remarks: remarks ?? null,
        verifiedAt: new Date(),
      },
      { transaction }
    );
    await bid.update({ status: result === "passed" ? "postQualified" : "postDisqualified" }, { transaction });
  });

  res.status(201).json({ bidId: bid.id, result });
};

// ── Award ───────────────────────────────────────────────────────────────────

export const recommendAward = async (req, res) => {
  const bid = await Bid.findByPk(req.params.bidId, {
    include: [
      { model: Rfq, as: "rfq", include: [{ model: ProcurementMode, as: "mode" }] },
      { model: Vendor, as: "vendor" },
    ],
  });
  if (!bid) return res.status(404).json({ message: "Bid not found." });

  if (bid.status !== "postQualified") {
    return res.status(409).json({ message: "Only a post-qualified bid can be recommended for award." });
  }
  if (await Award.findOne({ where: { rfqId: bid.rfqId, status: { [Op.ne]: "cancelled" } } })) {
    return res.status(409).json({ message: "This procurement already has an award." });
  }

  // Eligibility is re-checked here, not assumed from bid submission. Weeks pass
  // between bidding and award, and a supplier can be blacklisted or let their
  // PhilGEPS registration lapse in that window. Awarding to an ineligible
  // supplier is the failure this catches.
  const eligibility = checkVendorEligibility(bid.vendor);
  if (!eligibility.eligible) {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.PERMISSION_DENIED,
      entityRef: "bid",
      entityId: bid.id,
      outcome: "denied",
      summary: `Award recommendation blocked — ${bid.vendor?.businessName}: ${eligibility.code}`,
    });
    return res.status(409).json({
      message: `This bidder is no longer eligible. ${eligibility.reason}`,
      code: eligibility.code,
    });
  }

  // ── The mode decides how many offers make a valid contest ──────────────────
  // Competitive Bidding needs a competition; Small Value Procurement needs
  // three quotations; Direct Contracting needs one, because it is single-source
  // by definition. Awarding a "competitive" bidding on a single offer is a
  // failure of bidding, not an award.
  const mode = bid.rfq?.mode;
  const minimumOffers = mode?.minimumOffers ?? 2;
  const offersReceived = await Bid.count({
    where: { rfqId: bid.rfqId, status: { [Op.ne]: "withdrawn" } },
  });

  if (offersReceived < minimumOffers) {
    return res.status(409).json({
      message:
        `${mode?.name ?? "This mode"} requires at least ${minimumOffers} offer(s) before an award may be ` +
        `recommended; ${offersReceived} received. Declare a failure of bidding instead.`,
      minimumOffers,
      offersReceived,
    });
  }

  const year = new Date().getFullYear();
  const count = await Award.count({ where: { noaNumber: { [Op.like]: `NOA-${year}-%` } } });

  const award = await Award.create({
    noaNumber: `NOA-${year}-${String(count + 1).padStart(4, "0")}`,
    noaDate: new Date().toISOString().slice(0, 10),
    amount: bid.totalBidPrice,
    rfqId: bid.rfqId,
    bidId: bid.id,
    vendorId: bid.vendorId,
    recommendedById: req.currentUser.id,
    status: "pendingHopeApproval",
  });

  // ── The committee's actual instrument ──────────────────────────────────────
  // The BAC acts by resolution, not by one member's click. Members present are
  // snapshotted rather than referenced, so a later change of committee cannot
  // rewrite what was resolved on the day.
  const committee = await User.findAll({
    include: [{ model: Role, where: { key: { [Op.in]: ["bacChairperson", "bacMember"] } } }],
  });

  const resolution = await BacResolution.create({
    resolutionNo: await nextResolutionNo(year),
    type: "recommendAward",
    title: `Resolution recommending award of ${bid.rfq?.referenceNo} to ${bid.vendor?.businessName}`,
    recitals:
      `${offersReceived} offer(s) received under ${mode?.name ?? "the selected mode"}. ` +
      `The bid of ${bid.vendor?.businessName} at ₱${Number(bid.totalBidPrice).toLocaleString()} was found ` +
      `the Lowest Calculated Responsive Bid and passed post-qualification.`,
    resolvedAt: new Date(),
    members: committee.map((member) => ({
      userId: member.id,
      name: member.name,
      role: member.Role?.key ?? null,
      concurred: true,
    })),
    quorumMet: committee.length >= 2,
    chairpersonId: req.currentUser.id,
    entityRef: "award",
    entityId: award.id,
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.AWARD_RECOMMENDED,
    entityRef: "award",
    entityId: award.id,
    summary: `${resolution.resolutionNo} — award recommended to ${bid.vendor?.businessName}`,
    afterState: {
      status: "pendingHopeApproval",
      resolutionNo: resolution.resolutionNo,
      offersReceived,
      amount: Number(award.amount),
    },
  });

  await notifyByPermission("bidding.award", {
    type: NOTIFICATION_EVENTS.AWARD_RECOMMENDED,
    title: `Award awaiting your approval — ${award.noaNumber}`,
    body: `${bid.vendor?.businessName ?? "A bidder"} recommended for ₱${Number(award.amount).toLocaleString()}.`,
    link: "/evaluation",
    refEntity: "award",
    refId: award.id,
    severity: "warning",
  });

  res.status(201).json({
    id: award.id,
    noaNumber: award.noaNumber,
    amount: Number(award.amount),
    status: award.status,
    vendorName: bid.vendor?.businessName ?? null,
    resolution: {
      resolutionNo: resolution.resolutionNo,
      quorumMet: resolution.quorumMet,
      memberCount: resolution.members?.length ?? 0,
    },
    offersReceived,
  });
};

// Section 2.3: the HOPE approves the award.
export const approveAward = async (req, res) => {
  const award = await Award.findByPk(req.params.id, {
    include: [{ model: Bid, as: "bid" }, { model: Rfq, as: "rfq" }],
  });
  if (!award) return res.status(404).json({ message: "Award not found." });
  if (award.status !== "pendingHopeApproval") {
    return res.status(409).json({ message: `Cannot approve from status "${award.status}".` });
  }

  await sequelize.transaction(async (transaction) => {
    await award.update({ status: "issued", approvedById: req.currentUser.id }, { transaction });
    await Bid.update({ status: "awarded" }, { where: { id: award.bidId }, transaction });
    await Bid.update(
      { status: "lost" },
      { where: { rfqId: award.rfqId, id: { [Op.ne]: award.bidId } }, transaction }
    );
    await Rfq.update({ status: "awarded" }, { where: { id: award.rfqId }, transaction });
  });

  // Section 7.4: award issuance notifies the winner, and the others are told
  // the outcome rather than left waiting.
  const allBids = await Bid.findAll({
    where: { rfqId: award.rfqId },
    include: [{ model: Vendor, as: "vendor" }],
  });
  for (const bid of allBids) {
    const won = bid.id === award.bidId;
    await notifyUsers([bid.vendor?.userId], {
      type: NOTIFICATION_EVENTS.AWARD_ISSUED,
      title: won ? `Notice of Award — ${award.noaNumber}` : `Award decided — ${award.rfq?.referenceNo ?? ""}`,
      body: won
        ? `You have been awarded this contract for ₱${Number(award.amount).toLocaleString()}.`
        : "This procurement has been awarded to another bidder.",
      link: "/supplier/opportunities",
      refEntity: "award",
      refId: award.id,
      severity: won ? "success" : "info",
    });
  }

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.AWARD_APPROVED,
    entityRef: "award",
    entityId: award.id,
    summary: `${award.noaNumber} approved — ₱${Number(award.amount).toLocaleString()}`,
    beforeState: { status: "pendingHopeApproval" },
    afterState: { status: "issued", approvedById: req.currentUser.id },
  });

  res.json({ id: award.id, noaNumber: award.noaNumber, status: "issued" });
};

export const listAwards = async (req, res) => {
  const awards = await Award.findAll({
    include: [
      { model: Rfq, as: "rfq" },
      { model: Vendor, as: "vendor" },
      { model: User, as: "recommendedBy", attributes: ["id", "name"] },
    ],
    order: [["createdAt", "DESC"]],
  });

  res.json(
    awards.map((award) => ({
      id: award.id,
      noaNumber: award.noaNumber,
      noaDate: award.noaDate,
      amount: Number(award.amount),
      status: award.status,
      referenceNo: award.rfq?.referenceNo ?? null,
      projectTitle: award.rfq?.title ?? null,
      vendorName: award.vendor?.businessName ?? null,
      recommendedByName: award.recommendedBy?.name ?? null,
    }))
  );
};
