import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Rfq, Bid, BidOpeningRecord, Evaluation, PostQualification, Award } from "../models/biddingModel.js";
import { ProcurementMode } from "../models/procurementModeModel.js";
import { Vendor } from "../models/vendorModel.js";
import { PrHeader } from "../models/prModel.js";
import { AppEntry } from "../models/appEntryModel.js";
import { Department } from "../models/departmentModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { BacResolution, nextResolutionNo } from "../models/bacResolutionModel.js";
import { getLguProfile } from "../models/systemSettingModel.js";
import { notifyByPermission, notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import {
  suggestProcurementMode,
  requiresPrebidConference,
  minimumPostingDays,
  SVP_POSTING_EXEMPTION_CEILING,
} from "../services/procurementThresholds.js";
import { checkVendorEligibility } from "../services/vendorEligibility.js";
import { evaluateBacQuorum, PRESIDING_ROLE_KEYS } from "../services/bacCommittee.js";
import { unresolvedProtestsFor } from "./protestController.js";
import { ObserverInvitation, ObserverOrganization } from "../models/observerModel.js";
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
  const { prHeaderId, appEntryId, title, category, closingDate, prebidAt, procurementModeKey } = req.body;

  // ── Two ways a solicitation can arise ──────────────────────────────────────
  // The ordinary route is an approved requisition. The other is an Early
  // Procurement Activity: RA 12009 lets a Procuring Entity conduct procurement
  // up to but NOT including award before the appropriation ordinance is
  // enacted, against the updated Indicative APP (IRR Sec. 7.7.4). There is no
  // requisition at that point because there is nothing yet to obligate.
  if (!prHeaderId && appEntryId) {
    return createEpaSolicitation(req, res);
  }

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

  // ── The mode is inherited, not chosen here ─────────────────────────────────
  // The BAC determines the mode on the requisition (step 19) before any
  // solicitation exists, and that determination is a recorded act with a date,
  // an officer and a justification behind it. Letting this form pick a
  // different mode would mean the document advertised to the public disagreed
  // with the decision the committee actually minuted.
  //
  // `procurementModeKey` is still accepted, but only to *confirm* the
  // determination — a mismatch is refused rather than silently overriding it.
  if (!pr.procurementModeId) {
    return res.status(409).json({
      message:
        "No mode of procurement has been determined for this requisition. The BAC must determine the mode before it can be advertised.",
    });
  }

  const mode = await ProcurementMode.findByPk(pr.procurementModeId);
  if (!mode) return res.status(409).json({ message: "The determined procurement mode no longer exists." });

  if (procurementModeKey && procurementModeKey !== mode.key) {
    return res.status(409).json({
      message: `The BAC determined ${mode.name} for ${pr.prNumber}. To advertise under a different mode, redetermine it on the requisition.`,
      determinedMode: mode.key,
    });
  }

  const modeKey = mode.key;

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

// ── Early Procurement Activity (RA 12009; IRR Sec. 7.7.4) ───────────────────
// Procurement conducted before the appropriation ordinance is enacted, against
// the updated Indicative APP, and lawful only up to but not including award —
// which is enforced at `approveAward`, not here.
//
// This is one of the substantive things RA 12009 changed and the operational
// reason the indicative APP matters: without it an LGU cannot start buying
// until the ordinance is passed, and the first quarter of the year is lost.
const createEpaSolicitation = async (req, res) => {
  const { appEntryId, title, category, closingDate, prebidAt } = req.body;

  const appEntry = await AppEntry.findByPk(appEntryId, {
    include: [{ model: Department, as: "implementingUnit" }],
  });
  if (!appEntry) return res.status(400).json({ message: "That APP entry does not exist." });

  if (appEntry.planCycle !== "indicative") {
    return res.status(409).json({
      message:
        "A final APP line is procured through a requisition, not an EPA solicitation. Raise a " +
        "Purchase Request against it instead.",
    });
  }
  if (!appEntry.earlyProcurement) {
    return res.status(409).json({
      message:
        "This indicative APP line is not flagged for Early Procurement. IRR Sec. 7.7.2(i) requires the " +
        "APP to indicate whether a project is to be undertaken through EPA before it can be.",
    });
  }
  // Sec. 7.7.4 — EPA runs against the *updated* Indicative APP, i.e. the one
  // revised to the Local Expenditure Program and approved. A line still in
  // draft has not been through the BAC or the HoPE.
  if (!["approved", "locked"].includes(appEntry.status)) {
    return res.status(409).json({
      message: "The indicative APP line must be approved before an EPA solicitation can be advertised.",
    });
  }
  if (await Rfq.findOne({ where: { appEntryId, status: { [Op.notIn]: ["cancelled", "failed"] } } })) {
    return res.status(409).json({ message: "This plan line already has an active solicitation." });
  }
  if (!closingDate) return res.status(400).json({ message: "A closing date is required." });

  const abc = Number(appEntry.abc);
  const mode = await ProcurementMode.findOne({ where: { key: appEntry.procurementMode } });
  if (!mode) {
    return res.status(409).json({
      message: `The APP line specifies an unknown mode of procurement: ${appEntry.procurementMode}.`,
    });
  }

  const rfq = await Rfq.create({
    referenceNo: await nextReference(mode.key),
    title: title?.trim() || appEntry.projectTitle,
    abc,
    category: category ?? "goods",
    closingDate,
    prebidAt: prebidAt ?? null,
    prebidRequired: requiresPrebidConference(abc),
    postingRequired: mode.key !== "smallValueProcurement" || abc > SVP_POSTING_EXEMPTION_CEILING,
    appEntryId: appEntry.id,
    isEarlyProcurement: true,
    procurementModeId: mode.id,
    status: "draft",
  });

  res.status(201).json({
    ...serializeRfq(await Rfq.findByPk(rfq.id, rfqIncludes)),
    earlyProcurement: true,
    notice:
      "Early Procurement Activity. This solicitation may proceed through advertisement, opening and " +
      "evaluation, but no award may be made until the appropriation ordinance is enacted and the " +
      "plan line is finalised (RA 12009).",
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

  // IRR Sec. 51.1 — at an ABC of ₱3,000,000 or more the pre-bid conference is
  // mandatory. `prebidRequired` was being derived correctly at creation and
  // then never read, so a solicitation could be advertised with the conference
  // it is required to hold left unscheduled.
  if (rfq.prebidRequired && !rfq.prebidAt) {
    return res.status(409).json({
      message:
        `A pre-bid conference is mandatory for an ABC of ₱${Number(rfq.abc).toLocaleString()} ` +
        `(IRR Sec. 51.1). Schedule it before advertising this solicitation.`,
    });
  }

  // The conference has to fall inside the advertising window, and far enough
  // before the deadline for bidders to act on what they hear there.
  if (rfq.prebidAt) {
    const prebid = new Date(rfq.prebidAt);
    if (prebid >= new Date(rfq.closingDate)) {
      return res.status(400).json({
        message: "The pre-bid conference must be held before the deadline for submission of bids.",
      });
    }
  }

  // IRR Sec. 50 and 34.3(b) — the minimum period the opportunity must stay
  // open. Publishing with a deadline inside that window forecloses the
  // competition the posting exists to create.
  const minimumDays = minimumPostingDays(rfq);
  if (minimumDays > 0) {
    const earliestClose = new Date();
    earliestClose.setHours(0, 0, 0, 0);
    earliestClose.setDate(earliestClose.getDate() + minimumDays);
    if (new Date(rfq.closingDate) < earliestClose) {
      return res.status(400).json({
        message:
          `${rfq.mode?.name ?? "This mode"} must stay open for at least ${minimumDays} calendar day(s) ` +
          `after posting. Move the closing date to ${earliestClose.toISOString().slice(0, 10)} or later.`,
        minimumPostingDays: minimumDays,
      });
    }
  }

  await rfq.update({
    status: "published",
    publishDate: new Date().toISOString().slice(0, 10),
    publishedById: req.currentUser.id,
    // Sec. 50.3 — the posting reference the LGU can be audited against. The
    // system is not connected to PhilGEPS, so this records the act and the
    // reference the Secretariat obtained there rather than pretending to post.
    philgepsPostedAt: rfq.postingRequired ? new Date() : null,
    philgepsReference: req.body?.philgepsReference?.trim() || null,
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

  // The advertised deadline is a commitment to every prospective bidder. Closing
  // before it arrives shuts out anyone who was working to that date, which is
  // the same harm as never advertising. Cancellation is the lawful way to stop
  // a procurement early, and it demands a recorded reason.
  if (new Date() < new Date(rfq.closingDate)) {
    return res.status(409).json({
      message:
        `Bidding closes ${new Date(rfq.closingDate).toLocaleString()}. A solicitation cannot be closed ` +
        `before its advertised deadline — cancel it with a recorded reason instead.`,
      closingDate: rfq.closingDate,
    });
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

// ── Abstract of Bids / Quotations ───────────────────────────────────────────
// IRR Sec. 34.3(f) for SVP, and the same document by another name for
// competitive bidding: "an Abstract of Quotations or Ratings shall be prepared
// setting forth the names of those who responded... and their corresponding
// price quotations or ratings."
//
// It is also one of the five documents Sec. 43.5 entitles observers to demand,
// and the document they sign as witnesses. It did not exist in this system at
// all, which left observers with nothing to sign and the committee with no
// tabulation of what it received.
export const abstractOfBids = async (req, res) => {
  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });

  // The abstract is prepared after the deadline has passed — before that it
  // would disclose who has bid and at what, while bidding is still open.
  if (["draft", "published"].includes(rfq.status)) {
    return res.status(409).json({
      message: "The Abstract of Bids is prepared after the deadline for submission has closed.",
    });
  }

  const bids = await Bid.findAll({
    where: { rfqId: rfq.id },
    include: [{ model: Vendor, as: "vendor" }, { model: Evaluation, as: "evaluations" }],
    order: [["submittedAt", "ASC"]],
  });

  const opening = await BidOpeningRecord.findOne({
    where: { rfqId: rfq.id },
    include: [{ model: User, as: "openedBy", attributes: ["id", "name"] }],
  });

  // Identities stay masked while scoring is open, exactly as they are on every
  // other surface — the abstract does not become a way around the blind.
  const blind = isBlindStage(rfq);

  const observers = await ObserverInvitation.findAll({
    where: { rfqId: rfq.id, attendance: "attended" },
    include: [{ model: ObserverOrganization, as: "organization" }],
  });

  res.json({
    referenceNo: rfq.referenceNo,
    title: rfq.title,
    abc: Number(rfq.abc),
    category: rfq.category,
    mode: rfq.mode?.name ?? null,
    closingDate: rfq.closingDate,
    openedAt: opening?.openedAt ?? null,
    openedByName: opening?.openedBy?.name ?? null,
    bidsReceived: bids.length,
    blind,
    entries: bids.map((bid) => ({
      blindLabel: bid.blindLabel,
      bidderName: blind ? bid.blindLabel : (bid.vendor?.businessName ?? null),
      // The financial envelope stays sealed until the technical component
      // passes (IRR Sec. 58), so the abstract shows what is lawfully open.
      totalBidPrice: !blind && !bid.financialSealed ? Number(bid.totalBidPrice) : null,
      rating:
        bid.evaluations?.length > 0
          ? Number(
              (
                bid.evaluations.reduce((sum, e) => sum + Number(e.score), 0) / bid.evaluations.length
              ).toFixed(2)
            )
          : null,
      status: bid.status,
      submittedAt: bid.submittedAt,
    })),
    // Sec. 43 — the observers who attended and may sign as witnesses.
    witnesses: observers.map((invitation) => ({
      organization: invitation.organization?.name ?? null,
      sector: invitation.organization?.sector ?? null,
      representative: invitation.representativeName,
    })),
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

// ── Two different questions, two different instruments ───────────────────────
// Philippine competitive bidding does NOT score Goods and Infrastructure on a
// weighted rubric. The technical component is examined **pass or fail** against
// the eligibility and technical requirements, and among the bids that pass, the
// **lowest calculated price** wins (RA 12009 Sec. 65 — the LCRB).
//
// A weighted rating belongs only to Consulting Services, where the award goes
// to the Highest Rated Responsive Bid.
//
// This system applied a 0–100 averaged rubric with a hard-coded 60 pass mark to
// everything, which meant a goods procurement could be decided on how generously
// a member scored rather than on price — and could not produce a legally correct
// goods award at all.
export const usesRatedEvaluation = (category) => category === "consulting";

// The minimum rating a consulting proposal must reach to be responsive. The
// Bidding Documents set this per procurement; 60 is the long-standing default
// and is kept here as one named constant rather than a bare number in a
// comparison.
export const CONSULTING_PASSING_SCORE = 60;

export const submitEvaluation = async (req, res) => {
  const { criteriaBreakdown, remarks, verdict } = req.body;
  const bid = await Bid.findByPk(req.params.bidId, { include: [{ model: Rfq, as: "rfq" }] });
  if (!bid) return res.status(404).json({ message: "Bid not found." });

  if (bid.rfq.status !== "opened") {
    return res.status(409).json({ message: "Evaluation is not open for this procurement." });
  }

  // ── Conflict of interest ───────────────────────────────────────────────────
  // An evaluator with an interest in a bidder must not score it. There was no
  // check at all: any holder of `bidding.evaluate` could score any bid. The
  // declaration is required rather than assumed, so that the absence of a
  // conflict is a positive statement on the record.
  if (req.body.noConflictDeclared !== true) {
    return res.status(400).json({
      message:
        "Declare that you have no actual or potential interest in this bidder before scoring. An " +
        "evaluator with an interest must inhibit.",
      requiresDeclaration: true,
    });
  }

  // Section 7.9: scores are immutable once submitted.
  if (await Evaluation.findOne({ where: { bidId: bid.id, evaluatorId: req.currentUser.id } })) {
    return res.status(409).json({ message: "You have already scored this bid. Scores cannot be changed." });
  }

  const rated = usesRatedEvaluation(bid.rfq.category);
  let score;
  let breakdown;

  if (rated) {
    // Consulting Services — a rating, computed here rather than accepted.
    if (!criteriaBreakdown || typeof criteriaBreakdown !== "object") {
      return res.status(400).json({ message: "A rubric breakdown is required for consulting services." });
    }
    const values = Object.values(criteriaBreakdown);
    if (values.length === 0) return res.status(400).json({ message: "Score at least one criterion." });
    if (values.some((v) => !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100)) {
      return res.status(400).json({ message: "Each criterion must be scored between 0 and 100." });
    }
    score = Number((values.reduce((sum, v) => sum + Number(v), 0) / values.length).toFixed(2));
    breakdown = criteriaBreakdown;
  } else {
    // Goods and Infrastructure — pass or fail on the technical requirements.
    // The score column is retained so one ranking function serves both, but it
    // carries a verdict rather than a rating: 100 passed, 0 failed.
    if (!["passed", "failed"].includes(verdict)) {
      return res.status(400).json({
        message:
          `${bid.rfq.category === "infrastructure" ? "Infrastructure" : "Goods"} bids are rated pass or ` +
          `fail on the technical requirements, not scored. Submit a verdict of "passed" or "failed"; ` +
          `the award then goes to the lowest calculated responsive bid (RA 12009 Sec. 65).`,
        accepted: ["passed", "failed"],
      });
    }
    if (verdict === "failed" && !remarks?.trim()) {
      return res.status(400).json({
        message: "State which requirement the bid failed. A failure without a reason cannot be reviewed.",
      });
    }
    score = verdict === "passed" ? 100 : 0;
    breakdown = { verdict, requirementsExamined: criteriaBreakdown ?? null };
  }

  const evaluation = await Evaluation.create({
    bidId: bid.id,
    evaluatorId: req.currentUser.id,
    criteriaBreakdown: breakdown,
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

  const rated = usesRatedEvaluation(rfq.category);

  await sequelize.transaction(async (transaction) => {
    // Unseal the financial envelope only for bids that passed the technical
    // component — the financial envelope of a failed bid is returned unopened.
    for (const bid of bids) {
      const average =
        bid.evaluations.reduce((sum, e) => sum + Number(e.score), 0) / bid.evaluations.length;

      // For Consulting Services the rating decides, against the minimum score
      // the Bidding Documents set. For Goods and Infrastructure each evaluator
      // returns a pass/fail verdict, and a single failure fails the bid — the
      // technical requirements are a floor, not an average to be pulled up by
      // a generous member.
      const passed = rated ? average >= CONSULTING_PASSING_SCORE : bid.evaluations.every((e) => Number(e.score) === 100);

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

// ── Who is actually entitled to the award ────────────────────────────────────
// RA 12009 Sec. 65 gives the contract to the Lowest Calculated Responsive Bid
// for Goods and Infrastructure Projects, and to the Highest Rated Responsive
// Bid for Consulting Services. It is not the committee's to choose among the
// bidders who passed.
//
// This was previously unchecked: `recommendAward` accepted any post-qualified
// bid, while the resolution it generated asserted the bid "was found the Lowest
// Calculated Responsive Bid". The system would produce a signed committee
// resolution stating a fact nobody had verified — and it would have said the
// same thing about the most expensive offer on the table.
//
// Bids that failed the technical component or were post-disqualified drop out
// of the ranking, which is what lets the award move down the list when the
// lowest bidder fails post-qualification. That is the real procedure: bidders
// are post-qualified in order, and the next in line is taken up on failure.
const rankBids = (bids, category) => {
  const contenders = bids.filter((bid) =>
    ["technicalPassed", "postQualified"].includes(bid.status)
  );

  if (category === "consulting") {
    // HRRB — highest rated responsive bid.
    return {
      basis: "HRRB",
      basisLabel: "Highest Rated Responsive Bid",
      ranked: [...contenders].sort((a, b) => averageScore(b) - averageScore(a)),
    };
  }

  // LCRB — lowest calculated responsive bid.
  return {
    basis: "LCRB",
    basisLabel: "Lowest Calculated Responsive Bid",
    ranked: [...contenders].sort((a, b) => Number(a.totalBidPrice) - Number(b.totalBidPrice)),
  };
};

const averageScore = (bid) => {
  const evaluations = bid.evaluations ?? [];
  if (evaluations.length === 0) return 0;
  return evaluations.reduce((sum, e) => sum + Number(e.score), 0) / evaluations.length;
};

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

  // ── The bid must be the one the law entitles to the award ──────────────────
  const contenders = await Bid.findAll({
    where: { rfqId: bid.rfqId },
    include: [{ model: Evaluation, as: "evaluations" }, { model: Vendor, as: "vendor" }],
  });

  const { basis, basisLabel, ranked } = rankBids(contenders, bid.rfq?.category);
  const entitled = ranked[0];

  if (!entitled) {
    return res.status(409).json({
      message: "No bid remains eligible for award. Declare a failure of bidding.",
    });
  }

  if (entitled.id !== bid.id) {
    return res.status(409).json({
      message:
        `This is not the ${basisLabel}. ${entitled.vendor?.businessName ?? entitled.blindLabel} ` +
        (basis === "LCRB"
          ? `bid ₱${Number(entitled.totalBidPrice).toLocaleString()} against this bidder's ` +
            `₱${Number(bid.totalBidPrice).toLocaleString()}. `
          : `scored ${averageScore(entitled).toFixed(2)} against this bidder's ` +
            `${averageScore(bid).toFixed(2)}. `) +
        `Post-qualify and resolve that bid first; the award moves down the ranking only when the ` +
        `bidder ahead fails post-qualification (RA 12009 Sec. 65).`,
      basis,
      entitled: {
        blindLabel: entitled.blindLabel,
        vendorName: entitled.vendor?.businessName ?? null,
        totalBidPrice: Number(entitled.totalBidPrice),
        status: entitled.status,
      },
    });
  }

  // ── Sec. 84: "Protests must first be resolved before any award is made" ────
  // An award made over a live protest is void of the process the law requires,
  // and under Sec. 85 a bidder cannot even go to court until the mechanism has
  // run — so proceeding here would strand them.
  const pendingProtests = await unresolvedProtestsFor(bid.rfqId);
  if (pendingProtests.length > 0) {
    return res.status(409).json({
      message:
        `${pendingProtests.length} protest(s) or request(s) for reconsideration are unresolved on this ` +
        `procurement. Protests must first be resolved before any award is made (RA 12009 Sec. 84).`,
      protests: pendingProtests.map((protest) => ({
        id: protest.id,
        stage: protest.stage,
        vendorName: protest.vendor?.businessName ?? null,
        dueAt: protest.dueAt,
      })),
    });
  }

  // ── The committee must be quorate before it can resolve anything ───────────
  // Checked before the award record is written, so a committee that cannot
  // lawfully sit does not leave a dangling Notice of Award behind it.
  const committee = await User.findAll({
    include: [
      { model: Role, where: { key: { [Op.in]: [...PRESIDING_ROLE_KEYS, "bacMember"] } } },
    ],
  });

  // Who was actually in the room. Supplied by the Chairperson recording the
  // meeting; falling back to the full designated membership keeps existing
  // callers working, but the quorum rule is applied either way.
  const attendingIds = Array.isArray(req.body?.attendingMemberIds)
    ? req.body.attendingMemberIds.map(Number).filter(Boolean)
    : committee.map((member) => member.id);

  const present = committee.filter((member) => attendingIds.includes(member.id));

  const quorum = evaluateBacQuorum({ designated: committee, present, presidingId: req.currentUser.id });
  if (!quorum.ok) {
    return res.status(409).json({ message: quorum.message, quorum });
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
    awardBasis: basis,
  });

  // ── The committee's actual instrument ──────────────────────────────────────
  // The BAC acts by resolution, not by one member's click. Members present are
  // snapshotted rather than referenced, so a later change of committee cannot
  // rewrite what was resolved on the day.
  const resolution = await BacResolution.create({
    resolutionNo: await nextResolutionNo(year),
    type: "recommendAward",
    title: `Resolution recommending award of ${bid.rfq?.referenceNo} to ${bid.vendor?.businessName}`,
    // The recital states what was actually determined, with the figures behind
    // it. It previously asserted the bid "was found the Lowest Calculated
    // Responsive Bid" without anything having checked that — the ranking above
    // is now what earns this sentence.
    recitals:
      `${offersReceived} offer(s) received under ${mode?.name ?? "the selected mode"}. ` +
      `Of these, ${ranked.length} passed the technical component. ` +
      `The bid of ${bid.vendor?.businessName} at ₱${Number(bid.totalBidPrice).toLocaleString()} ranked ` +
      `first as the ${basisLabel} (${basis}) and passed post-qualification. ` +
      `Resolved by ${present.length} of ${committee.length} designated members.`,
    resolvedAt: new Date(),
    members: present.map((member) => ({
      userId: member.id,
      name: member.name,
      role: member.Role?.key ?? null,
      concurred: true,
    })),
    quorumMet: true,
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
    include: [
      { model: Bid, as: "bid" },
      { model: Rfq, as: "rfq", include: [{ model: AppEntry, as: "appEntry" }] },
    ],
  });
  if (!award) return res.status(404).json({ message: "Award not found." });
  if (award.status !== "pendingHopeApproval") {
    return res.status(409).json({ message: `Cannot approve from status "${award.status}".` });
  }

  // ── The line an Early Procurement Activity may not cross ───────────────────
  // EPA lets everything happen before the ordinance except this. RA 12009 and
  // the 2016 IRR before it are both explicit that no award of contract may be
  // made until the appropriation ordinance has been enacted — the LGU would be
  // committing money the Sanggunian has not granted.
  if (award.rfq?.isEarlyProcurement) {
    const planLine = award.rfq.appEntry;
    const finalised =
      planLine &&
      (planLine.planCycle === "final" ||
        (await AppEntry.findOne({
          where: { indicativeOriginId: planLine.id, planCycle: "final", status: { [Op.in]: ["approved", "locked"] } },
        })));

    if (!finalised) {
      return res.status(409).json({
        message:
          "This is an Early Procurement Activity. Procurement may proceed short of award, but no " +
          "contract may be awarded until the appropriation ordinance is enacted and the plan line is " +
          "finalised against it (RA 12009; IRR Sec. 7.7.5).",
        earlyProcurement: true,
      });
    }
  }

  // Sec. 84 — re-checked at approval, not only at recommendation: a protest can
  // be filed in the window between the committee resolving and the Mayor
  // signing, and that is exactly when a losing bidder files one.
  const pendingProtests = await unresolvedProtestsFor(award.rfqId);
  if (pendingProtests.length > 0) {
    return res.status(409).json({
      message:
        `${pendingProtests.length} protest(s) remain unresolved on this procurement. Protests must ` +
        `first be resolved before any award is made (RA 12009 Sec. 84).`,
    });
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

// ── Failure of bidding, and the road to Negotiated Procurement ───────────────
// RA 12009 Sec. 64. A bidding fails when no bids are received, no bid qualifies,
// or the bidder with the LCRB/HRRB fails post-qualification. After the SECOND
// failure the Procuring Entity may resort to Negotiated Procurement under
// Sec. 35.1 — which is why the count of failures has to be a fact on the record
// rather than something reconstructed from cancelled solicitations.
export const declareFailureOfBidding = async (req, res) => {
  const { reason } = req.body ?? {};
  const rfq = await Rfq.findByPk(req.params.id, rfqIncludes);
  if (!rfq) return res.status(404).json({ message: "RFQ/ITB not found." });

  if (["awarded", "cancelled", "failed"].includes(rfq.status)) {
    return res.status(409).json({ message: `Cannot declare a failure from status "${rfq.status}".` });
  }
  if (!reason?.trim()) {
    return res.status(400).json({
      message:
        "State the ground for the failure of bidding — no bids received, no bid qualified, or the " +
        "bidder with the lowest calculated bid failed post-qualification (RA 12009 Sec. 64).",
    });
  }

  // How many times this project has already failed. Counted across every
  // solicitation raised for the same requisition or plan line, because that is
  // the project — a new reference number is not a new procurement.
  const scope = rfq.prHeaderId ? { prHeaderId: rfq.prHeaderId } : { appEntryId: rfq.appEntryId };
  const priorFailures = await Rfq.count({ where: { ...scope, status: "failed" } });
  const failureNumber = priorFailures + 1;

  await sequelize.transaction(async (transaction) => {
    await rfq.update({ status: "failed", cancellationReason: reason.trim() }, { transaction });
    // Bids that were in play are neither awarded nor lost on the merits — the
    // contest itself did not conclude.
    await Bid.update(
      { status: "lost" },
      { where: { rfqId: rfq.id, status: { [Op.notIn]: ["withdrawn", "lost"] } }, transaction }
    );
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BIDDING_FAILED,
    entityRef: "rfq",
    entityId: rfq.id,
    summary: `${rfq.referenceNo}: failure of bidding no. ${failureNumber} — ${reason.trim()}`,
    beforeState: { status: rfq.status },
    afterState: { status: "failed", failureNumber, reason: reason.trim() },
  });

  const mayNegotiate = failureNumber >= 2;

  await notifyByPermission("bidding.publish", {
    type: NOTIFICATION_EVENTS.RFQ_PUBLISHED,
    title: `Failure of bidding — ${rfq.referenceNo}`,
    body: mayNegotiate
      ? "Second failure. The project may now be procured through Negotiated Procurement (Sec. 35.1)."
      : "First failure. The project must be re-advertised; a second failure opens Negotiated Procurement.",
    link: "/secretariat/rfq",
    refEntity: "rfq",
    refId: rfq.id,
    severity: "warning",
  });

  res.json({
    id: rfq.id,
    status: "failed",
    failureNumber,
    mayNegotiate,
    notice: mayNegotiate
      ? "Two failed biddings. Negotiated Procurement is available under Sec. 35.1. The BAC must first " +
        "conduct a mandatory review of the terms, conditions, specifications and cost estimates; the " +
        "ABC may not be increased by more than 20% of the last failed bidding."
      : "Re-advertise the project. Negotiated Procurement becomes available only after a second failure.",
  });
};

// RA 12009 Sec. 66 — the HoPE may disapprove the BAC's recommendation, "but
// only on the basis of valid, reasonable and justifiable grounds to be
// expressed in writing and furnished to the BAC". The system previously offered
// approval as the only outcome, which meant a Mayor who disagreed had no
// recorded way to say so and the recommendation simply sat unactioned.
export const disapproveAward = async (req, res) => {
  const { grounds } = req.body ?? {};
  const award = await Award.findByPk(req.params.id, {
    include: [{ model: Rfq, as: "rfq" }, { model: Vendor, as: "vendor" }],
  });
  if (!award) return res.status(404).json({ message: "Award not found." });
  if (award.status !== "pendingHopeApproval") {
    return res.status(409).json({ message: `Cannot disapprove from status "${award.status}".` });
  }

  // The grounds are the whole substance of the act — a disapproval without them
  // is exactly what Sec. 66 forbids.
  if (!grounds?.trim() || grounds.trim().length < 30) {
    return res.status(400).json({
      message:
        "A disapproval must state valid, reasonable and justifiable grounds in writing, furnished to " +
        "the BAC (RA 12009 Sec. 66). Record them here in at least 30 characters.",
    });
  }

  await sequelize.transaction(async (transaction) => {
    await award.update(
      { status: "disapproved", disapprovalGrounds: grounds.trim(), disapprovedAt: new Date() },
      { transaction }
    );
    // The solicitation goes back to the committee, not to the winner.
    await Rfq.update({ status: "evaluated" }, { where: { id: award.rfqId }, transaction });
  });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.AWARD_APPROVED,
    outcome: "denied",
    entityRef: "award",
    entityId: award.id,
    summary: `${award.noaNumber} disapproved by the Head of the Procuring Entity`,
    beforeState: { status: "pendingHopeApproval" },
    afterState: { status: "disapproved", grounds: grounds.trim() },
  });

  // Sec. 66 requires the grounds to be furnished to the BAC.
  await notifyByPermission("bidding.chairEvaluation", {
    type: NOTIFICATION_EVENTS.AWARD_RECOMMENDED,
    title: `${award.noaNumber} disapproved`,
    body: grounds.trim(),
    link: "/evaluation",
    refEntity: "award",
    refId: award.id,
    severity: "danger",
  });

  res.json({ id: award.id, status: "disapproved", grounds: grounds.trim() });
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
