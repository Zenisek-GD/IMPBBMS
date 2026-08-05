import crypto from "crypto";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Vendor, VendorDocument } from "../models/vendorModel.js";
import { Announcement } from "../models/announcementModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { ActivationToken } from "../models/activationTokenModel.js";
import { notifyUsers, notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";
import { recordAudit, auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { issueActivationToken } from "../services/activation.js";
import { sendActivationInvitation } from "../services/mailer.js";
import { activationTtlHours } from "../config/mail.js";

const withIncludes = {
  include: [
    { model: VendorDocument, as: "documents" },
    {
      model: User,
      as: "account",
      attributes: ["id", "name", "email", "status", "activatedAt"],
    },
    { model: User, as: "reviewedBy", attributes: ["id", "name"] },
    { model: User, as: "recordedBy", attributes: ["id", "name"] },
    {
      model: Announcement,
      as: "call",
      attributes: ["id", "title", "referenceNo", "registrationDeadline"],
    },
  ],
};

// ── Document review ─────────────────────────────────────────────────────────
// A registration cannot be verified until every declared document has actually
// been looked at. `attached` means submitted-but-unexamined, so a registration
// carrying one is a registration nobody has finished reviewing — approving it
// would put the Secretariat's name against papers they never opened.
const DOCUMENT_DECISIONS = ["verified", "rejected"];

const summariseDocumentReview = (documents = []) => {
  const unreviewed = documents.filter((doc) => doc.status === "attached");
  const rejected = documents.filter((doc) => doc.status === "rejected");
  return {
    total: documents.length,
    verified: documents.filter((doc) => doc.status === "verified").length,
    unreviewed: unreviewed.length,
    rejected: rejected.length,
    // The single question the console's approve button keys off.
    complete: documents.length > 0 && unreviewed.length === 0 && rejected.length === 0,
    unreviewedLabels: unreviewed.map((doc) => doc.label),
    rejectedLabels: rejected.map((doc) => doc.label),
  };
};

// Summary of the outstanding invitation, so the officials' console can show
// whether a bidder has been invited, whether they opened the link, and whether
// it has since expired — without the officer having to read the audit log.
//
// Deliberately says nothing about the token itself. There is no field here that
// could be combined with anything else to reconstruct the link.
const summariseInvitation = (token) => {
  if (!token) return null;

  const now = new Date();
  const expired = new Date(token.expiresAt) <= now;

  return {
    sentAt: token.sentAt,
    expiresAt: token.expiresAt,
    firstAccessedAt: token.firstAccessedAt,
    usedAt: token.usedAt,
    sendCount: token.sendCount,
    state: token.usedAt
      ? "used"
      : token.revokedAt
        ? "superseded"
        : expired
          ? "expired"
          : token.firstAccessedAt
            ? "opened"
            : "sent",
  };
};

const serialize = (vendor, invitation) => ({
  id: vendor.id,
  referenceCode: vendor.referenceCode,
  businessName: vendor.businessName,
  tin: vendor.tin,
  organizationType: vendor.organizationType,
  isJointVenture: vendor.isJointVenture,
  isForeignBidder: vendor.isForeignBidder,
  philgepsRegistrationNo: vendor.philgepsRegistrationNo,
  philgepsExpiry: vendor.philgepsExpiry,
  isVatRegistered: vendor.isVatRegistered,
  taxClassification: vendor.taxClassification,
  // The accredited address. This is what an account will be created against, so
  // the reviewing officer must be able to see exactly what they are approving.
  contactEmail: vendor.contactEmail,
  contactPerson: vendor.contactPerson,
  contactPhone: vendor.contactPhone,
  address: vendor.address,
  registrationStatus: vendor.registrationStatus,
  reviewRemarks: vendor.reviewRemarks,
  submittedAt: vendor.submittedAt,
  reviewedAt: vendor.reviewedAt,
  reviewedByName: vendor.reviewedBy?.name ?? null,

  // Provenance of the paper submission: when it came in, and which officer says
  // so. Null on the older records that predate counter intake.
  receivedAt: vendor.receivedAt,
  recordedByName: vendor.recordedBy?.name ?? null,

  // ── Account state ─────────────────────────────────────────────────────────
  hasAccount: Boolean(vendor.userId),
  accountCreatedAt: vendor.accountCreatedAt,
  accountName: vendor.account?.name ?? null,
  accountEmail: vendor.account?.email ?? null,
  accountStatus: vendor.account?.status ?? null,
  accountActivatedAt: vendor.account?.activatedAt ?? null,
  invitation: invitation !== undefined ? invitation : null,

  // ── The call this application answered ────────────────────────────────────
  // Null for an unsolicited application, which is legitimate — accreditation is
  // a standing status, not a per-opportunity one.
  callId: vendor.call?.id ?? null,
  callTitle: vendor.call?.title ?? null,
  callReferenceNo: vendor.call?.referenceNo ?? null,
  callRegistrationDeadline: vendor.call?.registrationDeadline ?? null,

  // An account may only be created for an approved registration that does not
  // have one yet, and only if an accredited address was captured.
  canCreateAccount:
    vendor.registrationStatus === "verified" && !vendor.userId && Boolean(vendor.contactEmail),

  // Where the document-by-document review has got to. Drives the console's
  // approve button, and is the same computation the server enforces with in
  // reviewVendor — so the button being enabled and the request being accepted
  // cannot disagree.
  documentReview: summariseDocumentReview(vendor.documents ?? []),

  documents: (vendor.documents ?? []).map((doc) => ({
    id: doc.id,
    docType: doc.docType,
    label: doc.label,
    citation: doc.citation,
    fileRef: doc.fileRef,
    expiryDate: doc.expiryDate,
    status: doc.status,
    remarks: doc.remarks,
  })),
  // Only a verified vendor may bid (Section 2.2 — controlled onboarding).
  canBid: vendor.registrationStatus === "verified",
});

// A vendor user reads their own accreditation; the Secretariat sees all.
const ownProfileFor = async (userId) =>
  Vendor.findOne({ where: { userId }, ...withIncludes });

/**
 * READ ONLY. The bidder can see what the BAC office holds on file for them —
 * which documents were accepted, which were rejected and why — but cannot change
 * any of it.
 *
 * The write counterparts to this (`upsertMyVendorProfile`, `submitMyVendorProfile`)
 * were removed: accreditation requirements are submitted on paper at the BAC
 * office, so there is no online path by which a bidder files or amends them. An
 * amendment is a fresh counter submission, recorded by an officer.
 */
export const getMyVendorProfile = async (req, res) => {
  const vendor = await ownProfileFor(req.currentUser.id);
  if (!vendor) return res.json(null);
  res.json(serialize(vendor));
};

// ── BAC Secretariat counter intake ──────────────────────────────────────────
// Step 1 of onboarding, from the office's side of the counter.
//
// A prospective bidder walks in with their eligibility and accreditation papers.
// There is no online submission — this endpoint is how those papers enter the
// system, keyed in by the officer who physically received them. That is the whole
// difference from the intake endpoint it replaces: the actor is an accountable
// officer at a desk, not an anonymous form on the internet, so the record can say
// who received the documents and when.

const ORGANIZATION_TYPES = ["corporation", "partnership", "soleProprietorship", "cooperative"];
const TAX_CLASSIFICATIONS = ["goods", "services"];

// Not sequential. A running number would publish how many bidders have applied
// and would let one applicant guess another's reference.
const generateReferenceCode = () => {
  // No I, O, 1 or 0 — this code gets read off a screen onto a paper receipt and
  // back again, and those four are what get transcribed wrongly.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const body = Array.from(
    crypto.randomBytes(8),
    (byte) => alphabet[byte % alphabet.length]
  ).join("");
  return `BR-${new Date().getFullYear()}-${body}`;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@,]+\.[a-z]{2,}$/i;

/**
 * Records an accreditation submission received in person.
 *
 * Lands in `submitted` — the same queue the officer then works through
 * document by document — because handing papers over the counter IS the
 * submission. There is no draft state to pick up later: if the file is
 * incomplete the officer returns it, which is a decision on the record.
 */
export const recordCounterSubmission = async (req, res) => {
  const {
    businessName,
    tin,
    organizationType,
    isJointVenture,
    isForeignBidder,
    philgepsRegistrationNo,
    philgepsExpiry,
    isVatRegistered,
    taxClassification,
    contactEmail,
    contactPerson,
    contactPhone,
    address,
    documents,
    announcementId,
    receivedAt,
  } = req.body ?? {};

  const errors = {};

  const cleanBusinessName = String(businessName ?? "").trim();
  if (!cleanBusinessName) errors.businessName = "Registered business name is required.";
  else if (cleanBusinessName.length > 200) errors.businessName = "That name is too long.";

  const cleanContactPerson = String(contactPerson ?? "").trim();
  if (!cleanContactPerson) errors.contactPerson = "An authorized contact person is required.";

  // The address every later step is bound to: the account Admin/IT creates
  // carries it, the activation link goes to it, and the one-time code that proves
  // ownership goes to it. Wrong here means an approved bidder who can never be
  // given access, so it is required even though the submission is on paper.
  const email = String(contactEmail ?? "").trim().toLowerCase();
  if (!email) errors.contactEmail = "An active email address is required.";
  else if (!EMAIL_PATTERN.test(email)) errors.contactEmail = "Enter a valid email address.";
  else if (email.length > 190) errors.contactEmail = "That email address is too long.";

  if (organizationType && !ORGANIZATION_TYPES.includes(organizationType)) {
    errors.organizationType = "Choose a valid organization type.";
  }
  if (taxClassification && !TAX_CLASSIFICATIONS.includes(taxClassification)) {
    errors.taxClassification = "Choose a valid tax classification.";
  }

  const declared = Array.isArray(documents) ? documents : [];
  if (declared.length === 0) {
    errors.documents = "Record at least one document as received.";
  }

  // When the papers were actually handed in, which is not necessarily when they
  // are keyed in. It is what the deadline is judged against, so it is the
  // officer's statement of fact rather than a timestamp the server invents.
  const received = receivedAt ? new Date(receivedAt) : new Date();
  if (Number.isNaN(received.getTime())) {
    errors.receivedAt = "That is not a valid date.";
  } else if (received > new Date(Date.now() + 86400000)) {
    errors.receivedAt = "Documents cannot be recorded as received in the future.";
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
  }

  // ── One live application per business ─────────────────────────────────────
  // Unlike the old public form, this refusal is reported plainly: the caller is
  // an officer who is entitled to know the bidder is already on file, and who
  // needs to be sent to the existing record rather than creating a duplicate.
  const [existing, existingAccount] = await Promise.all([
    Vendor.findOne({
      where: { contactEmail: email, registrationStatus: { [Op.in]: ["submitted", "verified"] } },
    }),
    User.findOne({ where: { email } }),
  ]);

  if (existing) {
    return res.status(409).json({
      message:
        `${existing.businessName} already has a ${existing.registrationStatus} registration ` +
        `on file (${existing.referenceCode ?? "no reference"}). Open that record instead of ` +
        `recording a second one.`,
      existingVendorId: existing.id,
    });
  }
  if (existingAccount) {
    return res.status(409).json({
      message: `${email} already belongs to a system account. Use a different address, or open the existing bidder record.`,
    });
  }

  // A previously returned application is amended in place, so the review history
  // of that business stays on one record.
  const returned = await Vendor.findOne({
    where: { contactEmail: email, registrationStatus: "returned" },
  });

  let call = null;
  if (announcementId) {
    call = await Announcement.findByPk(announcementId);
    if (!call) {
      return res.status(400).json({
        message: "That call for bidders could not be found.",
        errors: { announcementId: "Choose a call from the list." },
      });
    }
  }

  const referenceCode = returned?.referenceCode ?? generateReferenceCode();

  const profile = {
    businessName: cleanBusinessName,
    tin: String(tin ?? "").trim() || null,
    organizationType: organizationType ?? "corporation",
    isJointVenture: Boolean(isJointVenture),
    isForeignBidder: Boolean(isForeignBidder),
    philgepsRegistrationNo: String(philgepsRegistrationNo ?? "").trim() || null,
    philgepsExpiry: philgepsExpiry || null,
    isVatRegistered: isVatRegistered === undefined ? true : Boolean(isVatRegistered),
    taxClassification: taxClassification ?? "goods",
    contactEmail: email,
    contactPerson: cleanContactPerson,
    contactPhone: String(contactPhone ?? "").trim() || null,
    address: String(address ?? "").trim() || null,
    referenceCode,
    announcementId: call?.id ?? null,
    registrationStatus: "submitted",
    receivedAt: received,
    recordedByUserId: req.currentUser.id,
    submittedAt: received,
    reviewRemarks: null,
    reviewedAt: null,
    reviewedByUserId: null,
  };

  const vendor = await sequelize.transaction(async (transaction) => {
    let record;
    if (returned) {
      await returned.update(profile, { transaction });
      record = returned;
    } else {
      record = await Vendor.create(profile, { transaction });
    }

    // Replaced wholesale, so a document dropped from a resubmission is actually
    // dropped rather than lingering from the previous attempt.
    await VendorDocument.destroy({ where: { vendorId: record.id }, transaction });
    await VendorDocument.bulkCreate(
      declared
        .filter((doc) => doc?.docType && doc?.label)
        .map((doc) => ({
          vendorId: record.id,
          docType: String(doc.docType).slice(0, 120),
          label: String(doc.label).slice(0, 255),
          citation: doc.citation ? String(doc.citation).slice(0, 255) : null,
          expiryDate: doc.expiryDate || null,
          fileRef: null,
          // Received, not yet examined. The officer logging the submission and
          // the officer checking each paper against the IRR are the same person
          // here, but they are separate acts and the second one is the audited
          // one — so nothing arrives pre-approved.
          status: "attached",
        })),
      { transaction }
    );

    return record;
  });

  const late = call?.registrationDeadline
    ? received > new Date(call.registrationDeadline)
    : false;

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BIDDER_REQUIREMENTS_SUBMITTED,
    entityRef: "vendor",
    entityId: vendor.id,
    summary: `Counter submission recorded for ${cleanBusinessName} (${referenceCode})`,
    afterState: {
      referenceCode,
      businessName: cleanBusinessName,
      contactEmail: email,
      organizationType: profile.organizationType,
      philgepsRegistrationNo: profile.philgepsRegistrationNo,
      documentsReceived: declared.length,
      receivedAt: received,
      resubmission: Boolean(returned),
      announcementId: call?.id ?? null,
      announcementTitle: call?.title ?? null,
      registrationDeadline: call?.registrationDeadline ?? null,
      // On the record because it is the fact a protest would turn on.
      receivedAfterDeadline: late,
    },
  });

  res.status(201).json({
    ...serialize(await Vendor.findByPk(vendor.id, withIncludes)),
    // Surfaced so the officer sees it immediately rather than discovering it at
    // approval time. Recording a late submission is allowed — refusing it at the
    // keyboard would not un-receive the papers — but it is flagged, not silent.
    receivedAfterDeadline: late,
  });
};

// ── BAC Secretariat review ──────────────────────────────────────────────────

// The newest invitation per bidder, fetched in one query rather than one per row.
const invitationsFor = async (userIds) => {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return new Map();

  const tokens = await ActivationToken.findAll({
    where: { userId: { [Op.in]: ids } },
    order: [["createdAt", "DESC"]],
  });

  const newest = new Map();
  for (const token of tokens) {
    if (!newest.has(token.userId)) newest.set(token.userId, token);
  }
  return newest;
};

export const listVendors = async (req, res) => {
  const { status, search } = req.query;
  const where = {};
  if (status) where.registrationStatus = status;
  if (search) {
    where[Op.or] = [
      { businessName: { [Op.like]: `%${search}%` } },
      { referenceCode: { [Op.like]: `%${search}%` } },
      { contactEmail: { [Op.like]: `%${search}%` } },
    ];
  }

  const vendors = await Vendor.findAll({
    where,
    ...withIncludes,
    // Submitted registrations first — that is the queue the officer is here to
    // work through — then most recently submitted within each status.
    order: [
      [
        sequelize.literal(
          "CASE WHEN `Vendor`.`registrationStatus` = 'submitted' THEN 0 ELSE 1 END"
        ),
        "ASC",
      ],
      ["submittedAt", "DESC"],
      ["businessName", "ASC"],
    ],
  });

  const invitations = await invitationsFor(vendors.map((vendor) => vendor.userId));
  res.json(
    vendors.map((vendor) =>
      serialize(vendor, summariseInvitation(invitations.get(vendor.userId) ?? null))
    )
  );
};

export const reviewVendor = async (req, res) => {
  const { decision, remarks } = req.body;
  const vendor = await Vendor.findByPk(req.params.id, withIncludes);
  if (!vendor) return res.status(404).json({ message: "Vendor not found." });

  if (vendor.registrationStatus !== "submitted") {
    return res.status(409).json({ message: "Only a submitted registration can be reviewed." });
  }

  if (!["verify", "return", "blacklist"].includes(decision)) {
    return res.status(400).json({ message: "Decision must be verify, return, or blacklist." });
  }
  if (decision !== "verify" && !remarks?.trim()) {
    return res.status(400).json({ message: "Remarks are required when returning or blacklisting." });
  }

  // Approving a registration with no accredited email would produce a record that
  // can never be turned into an account: there would be nowhere to send the
  // invitation, and nowhere to send the code that proves the bidder owns it.
  if (decision === "verify" && !vendor.contactEmail) {
    return res.status(400).json({
      message:
        "This registration has no email address on file. An approved bidder must have a " +
        "verified email address before an account can be created — return the registration " +
        "and ask for one.",
    });
  }

  // ── Every document must have been examined ────────────────────────────────
  // The accreditation decision is a statement that the requirements are complete
  // and valid. That statement cannot be made over papers nobody opened, so a
  // registration with an unreviewed document cannot be verified — and one with a
  // rejected document must be returned to the applicant rather than approved
  // around the rejection.
  //
  // Returning and blacklisting are unaffected: those are exactly the decisions an
  // officer reaches when the documents are wrong, and requiring a full review
  // first would trap an obviously deficient application in the queue.
  if (decision === "verify") {
    const review = summariseDocumentReview(vendor.documents ?? []);

    if (review.total === 0) {
      return res.status(409).json({
        message:
          "This registration has no documents on file, so there is nothing to verify. Return it " +
          "and ask the applicant to submit their requirements.",
      });
    }
    if (review.unreviewed > 0) {
      return res.status(409).json({
        message:
          `${review.unreviewed} document${review.unreviewed === 1 ? "" : "s"} on this registration ` +
          `${review.unreviewed === 1 ? "has" : "have"} not been reviewed yet: ` +
          `${review.unreviewedLabels.join(", ")}. Check each one before approving the bidder.`,
        documentReview: review,
      });
    }
    if (review.rejected > 0) {
      return res.status(409).json({
        message:
          `${review.rejectedLabels.join(", ")} ${review.rejected === 1 ? "was" : "were"} marked ` +
          "invalid, so this registration cannot be verified. Return it to the applicant with " +
          "remarks so they can supply a replacement.",
        documentReview: review,
      });
    }
  }

  const statusByDecision = { verify: "verified", return: "returned", blacklist: "blacklisted" };
  const previousStatus = vendor.registrationStatus;

  await vendor.update({
    registrationStatus: statusByDecision[decision],
    reviewRemarks: remarks?.trim() ?? null,
    reviewedAt: new Date(),
    reviewedByUserId: req.currentUser.id,
  });

  // Workflow requirement 11: the accreditation decision itself is a critical
  // procurement action, and it is the decision that authorises the account
  // creation that may follow. Recorded against the officer who made it.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BIDDER_REQUIREMENTS_REVIEWED,
    entityRef: "vendor",
    entityId: vendor.id,
    outcome: decision === "verify" ? "success" : "denied",
    summary: `Bidder registration for ${vendor.businessName} was ${statusByDecision[decision]}`,
    beforeState: { registrationStatus: previousStatus },
    afterState: {
      registrationStatus: statusByDecision[decision],
      // The address the approval is granted against — the fact on which every
      // later activation check depends, so it is on the record here.
      accreditedEmail: vendor.contactEmail,
      remarks: remarks?.trim() ?? null,
      // How many papers stood behind the decision. An approval recorded with a
      // document count of zero would be visible as such in the log.
      documentsExamined: (vendor.documents ?? []).length,
    },
  });

  // Section 7.4: the vendor is told the outcome in-system rather than having
  // to check back. No-ops when there is no account yet, which is the normal case
  // for a first accreditation — the applicant is told by email instead, when the
  // invitation goes out.
  await notifyUsers([vendor.userId], {
    type: decision === "verify" ? NOTIFICATION_EVENTS.VENDOR_VERIFIED : NOTIFICATION_EVENTS.VENDOR_RETURNED,
    title:
      decision === "verify"
        ? "Your vendor registration is verified"
        : `Your vendor registration was ${statusByDecision[decision]}`,
    body:
      decision === "verify"
        ? "You may now bid on published opportunities."
        : remarks?.trim(),
    link: "/supplier/eligibility",
    refEntity: "vendor",
    refId: vendor.id,
    severity: decision === "verify" ? "success" : "danger",
  });

  // ── Hand off to Admin/IT ──────────────────────────────────────────────────
  // The Secretariat's approval is not the end of onboarding, it is the trigger
  // for the next office. Since the Secretariat can no longer create the account
  // itself, an approved registration would otherwise sit in a queue that nobody
  // is prompted to look at — the bidder would be told they were approved and
  // then wait indefinitely for an account that no one knew to issue.
  //
  // Addressed by permission rather than by role, so the matrix stays the single
  // source of truth for who Admin/IT actually is.
  if (decision === "verify") {
    await notifyByPermission("bidders.createAccount", {
      type: NOTIFICATION_EVENTS.BIDDER_AWAITING_ACCOUNT,
      title: "Approved bidder awaiting an account",
      body:
        `${vendor.businessName} was verified by the BAC Secretariat and needs an account ` +
        `issued to ${vendor.contactEmail}.`,
      link: "/admin/bidder-accounts",
      refEntity: "vendor",
      refId: vendor.id,
      severity: "info",
    });
  }

  res.json(serialize(await Vendor.findByPk(vendor.id, withIncludes)));
};

/**
 * Records the reviewing officer's decision on a single submitted document.
 *
 * This is the act the accreditation decision is built out of. Previously the
 * Secretariat could only accept or return a registration as a whole, which meant
 * "one certificate has expired" and "none of this is right" were the same
 * message to the applicant, and the reviewer's actual findings were never
 * written down anywhere.
 *
 * Deliberately reversible: a document may be re-marked while the registration is
 * still under review, because an officer who mis-clicks on item three of eleven
 * should not have to send the whole application back to fix it. It becomes
 * immutable when the registration itself is decided.
 */
export const reviewVendorDocument = async (req, res) => {
  const { status, remarks } = req.body ?? {};
  const vendor = await Vendor.findByPk(req.params.id, withIncludes);
  if (!vendor) return res.status(404).json({ message: "Vendor not found." });

  // Only while the application is actually in front of the reviewer. Marking
  // documents on an already-decided registration would let the evidence be
  // rewritten after the decision it supposedly supported.
  if (vendor.registrationStatus !== "submitted") {
    return res.status(409).json({
      message:
        "Documents can only be reviewed while the registration is submitted and under review. " +
        `This one is ${vendor.registrationStatus}.`,
    });
  }

  const document = (vendor.documents ?? []).find(
    (doc) => String(doc.id) === String(req.params.documentId)
  );
  if (!document) {
    return res.status(404).json({ message: "That document is not part of this registration." });
  }

  if (!DOCUMENT_DECISIONS.includes(status)) {
    return res.status(400).json({ message: "Decision must be verified or rejected." });
  }

  // A rejection is what the applicant has to act on, so it has to say what is
  // wrong. An approval needs no explanation.
  const cleanRemarks = String(remarks ?? "").trim();
  if (status === "rejected" && !cleanRemarks) {
    return res.status(400).json({
      message:
        "Say what is wrong with this document. The applicant is shown these remarks and cannot " +
        "correct a rejection that does not explain itself.",
    });
  }

  const previousStatus = document.status;
  await document.update({ status, remarks: cleanRemarks || null });

  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BIDDER_DOCUMENT_REVIEWED,
    entityRef: "vendor",
    entityId: vendor.id,
    outcome: status === "verified" ? "success" : "denied",
    summary: `${document.label} for ${vendor.businessName} marked ${status}`,
    beforeState: { docType: document.docType, status: previousStatus },
    afterState: {
      docType: document.docType,
      label: document.label,
      status,
      remarks: cleanRemarks || null,
      // The citation the requirement came from, so the log shows which rule the
      // officer was checking against.
      citation: document.citation,
    },
  });

  res.json(serialize(await Vendor.findByPk(vendor.id, withIncludes)));
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 of bidder onboarding: Admin/IT creates the account.
//
// This is the gate the whole design turns on. There is no path by which a bidder
// can bring an account into existence — this endpoint is the only one that
// creates a vendor user, it requires the `bidders.createAccount` permission, and
// it will only act on a registration the BAC has already marked verified.
//
// Two offices must act before a bidder can sign in, and neither can do the
// other's half: the BAC Secretariat approves the requirements (`bidding.publish`)
// but cannot issue a credential, and Admin/IT issues the credential
// (`bidders.createAccount`) but cannot approve a registration. The check below
// on `registrationStatus !== "verified"` is what makes that ordering binding
// rather than merely conventional — Admin/IT cannot skip ahead of the review.
// ─────────────────────────────────────────────────────────────────────────────

// The account is created with a password nobody knows, including the officer who
// created it and the bidder it belongs to.
//
// A column that cannot be null needs a value, and the temptation is to generate
// something the officer reads out over the phone. That would put a working
// credential in a second pair of hands and give the bidder an account they could
// use without ever proving they hold the accredited mailbox — which is precisely
// what the activation flow exists to establish. So the placeholder is 64 random
// bytes that are hashed and immediately forgotten: unguessable, never displayed,
// never transmitted, and unusable in any case while the account sits in
// `pendingActivation`. The bidder's real password is set by the bidder, during
// activation, and has no relationship to this value.
const unusablePassword = () => crypto.randomBytes(64).toString("hex");

export const createBidderAccount = async (req, res) => {
  const vendor = await Vendor.findByPk(req.params.id, withIncludes);
  if (!vendor) return res.status(404).json({ message: "Registration not found." });

  // ── Preconditions ─────────────────────────────────────────────────────────
  if (vendor.registrationStatus !== "verified") {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.BIDDER_ACCOUNT_CREATED,
      outcome: "denied",
      entityRef: "vendor",
      entityId: vendor.id,
      summary: `Refused to create an account for ${vendor.businessName} — registration is ${vendor.registrationStatus}, not verified`,
    });
    return res.status(409).json({
      message:
        "An account can only be created once the bidder's registration has been verified. " +
        `This registration is currently ${vendor.registrationStatus}.`,
    });
  }

  if (vendor.userId) {
    return res.status(409).json({
      message: "This bidder already has an account. Use “Resend invitation” if they cannot reach it.",
    });
  }

  const accreditedEmail = vendor.contactEmail?.trim().toLowerCase();
  if (!accreditedEmail) {
    return res.status(400).json({
      message: "This registration has no accredited email address, so no invitation can be sent.",
    });
  }

  // The account must carry the accredited address and no other. The officer is
  // deliberately given no field to type an email into: the address comes from the
  // approved registration, so an account cannot be pointed at a mailbox that was
  // never part of the accreditation. `displayName` is the only thing they may
  // choose, and the bidder can change it during activation anyway.
  if (await User.findOne({ where: { email: accreditedEmail } })) {
    return res.status(409).json({
      message:
        "An account already exists for the email address on this registration. " +
        "Link or correct that account before creating another.",
    });
  }

  const vendorRole = await Role.findOne({ where: { key: "vendor" } });
  if (!vendorRole) {
    return res.status(500).json({ message: "The vendor role is missing. Run the seed script." });
  }

  const requestedName = String(req.body?.displayName ?? "").trim();
  const displayName = requestedName || vendor.contactPerson?.trim() || vendor.businessName;

  // ── Create ────────────────────────────────────────────────────────────────
  const { user, invitation } = await sequelize.transaction(async (transaction) => {
    const created = await User.create(
      {
        name: displayName.slice(0, 190),
        email: accreditedEmail,
        password: unusablePassword(),
        roleId: vendorRole.id,
        // Inert until the bidder activates it. Login, /me, and every
        // permission check reject anything that is not `active`.
        status: "pendingActivation",
        // Vendors are external to the LGU and belong to no municipal office.
        departmentId: null,
      },
      { transaction }
    );

    await vendor.update(
      { userId: created.id, accountCreatedAt: new Date() },
      { transaction }
    );

    return { user: created, invitation: null };
  });

  // Issued outside the transaction: the token is only useful once the account row
  // is durable, and an invitation whose account was rolled back would be a link
  // to nothing.
  const issued = await issueActivationToken({ user, issuedByUserId: req.currentUser.id });

  // Workflow requirement 11: account creation by an official.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BIDDER_ACCOUNT_CREATED,
    entityRef: "user",
    entityId: user.id,
    summary: `Bidder account created for ${vendor.businessName} (${accreditedEmail})`,
    afterState: {
      vendorId: vendor.id,
      referenceCode: vendor.referenceCode,
      businessName: vendor.businessName,
      accountEmail: accreditedEmail,
      displayName: user.name,
      role: "vendor",
      status: "pendingActivation",
      // Recorded so a reviewer can see the window during which the link was
      // live. The link itself is not recorded and cannot be reconstructed from
      // anything here.
      invitationExpiresAt: issued.record.expiresAt,
    },
  });

  const delivery = await deliverInvitation({ req, vendor, user, issued });

  res.status(201).json({
    message: delivery.ok
      ? `Account created. An activation link has been emailed to ${accreditedEmail} and expires in ${activationTtlHours} hours.`
      : `Account created, but the invitation email could not be sent (${delivery.error}). Use “Resend invitation” once mail is working.`,
    emailSent: delivery.ok,
    emailError: delivery.error ?? null,
    vendor: serialize(
      await Vendor.findByPk(vendor.id, withIncludes),
      summariseInvitation(issued.record)
    ),
  });
};

// Sends the invitation and records the outcome. Shared by creation and resend so
// both audit the send identically.
//
// A failed send is recorded as a `denied` audit entry rather than being swallowed:
// an account that exists but was never invited is a real state the Secretariat
// needs to be able to find, and the officer's own console message is not a
// durable record of it.
async function deliverInvitation({ req, vendor, user, issued }) {
  const result = await sendActivationInvitation({
    to: user.email,
    businessName: vendor.businessName,
    contactName: vendor.contactPerson ?? user.name,
    activationUrl: issued.url,
    expiresInHours: issued.expiresInHours,
    invitedBy: `${req.currentUser.name} (${req.currentUser.Role?.name ?? "official"})`,
  });

  const ok = !result.error;

  if (ok) {
    await issued.record.update({ sentAt: new Date() });
  }

  // Workflow requirement 11: invitation email sent.
  await auditFromRequest(req, {
    actionType: ok ? AUDIT_ACTIONS.BIDDER_INVITATION_SENT : AUDIT_ACTIONS.BIDDER_INVITATION_FAILED,
    outcome: ok ? "success" : "failed",
    entityRef: "user",
    entityId: user.id,
    summary: ok
      ? `Activation invitation sent to ${user.email} for ${vendor.businessName}`
      : `Activation invitation to ${user.email} FAILED for ${vendor.businessName}`,
    afterState: {
      recipient: user.email,
      transport: result.transport,
      attempt: issued.record.sendCount,
      expiresAt: issued.record.expiresAt,
      // Present only on failure. The SMTP error text is operational detail — a
      // rejected recipient, a refused handshake — and carries no credential.
      error: result.error ?? null,
    },
  });

  return { ok, error: result.error ?? null, transport: result.transport };
}

// Re-invites a bidder whose link expired, went to a mailbox they could not reach,
// or was never delivered. Issuing a new token revokes the old one, so a link that
// leaked earlier stops working the moment a replacement is sent.
export const resendBidderInvitation = async (req, res) => {
  const vendor = await Vendor.findByPk(req.params.id, withIncludes);
  if (!vendor) return res.status(404).json({ message: "Registration not found." });
  if (!vendor.userId) {
    return res.status(409).json({ message: "This bidder does not have an account yet." });
  }

  const user = await User.findByPk(vendor.userId);
  if (!user) return res.status(409).json({ message: "The linked account no longer exists." });

  if (user.status === "active") {
    return res.status(409).json({
      message: "This account is already active. Use the password reset flow instead.",
    });
  }
  if (user.status === "inactive") {
    return res.status(409).json({
      message: "This account is deactivated. Reactivate it before sending an invitation.",
    });
  }

  const issued = await issueActivationToken({ user, issuedByUserId: req.currentUser.id });
  const delivery = await deliverInvitation({ req, vendor, user, issued });

  res.json({
    message: delivery.ok
      ? `A new activation link has been emailed to ${user.email}. It expires in ${activationTtlHours} hours, and any earlier link no longer works.`
      : `The invitation could not be sent (${delivery.error}).`,
    emailSent: delivery.ok,
    emailError: delivery.error ?? null,
    vendor: serialize(
      await Vendor.findByPk(vendor.id, withIncludes),
      summariseInvitation(issued.record)
    ),
  });
};
