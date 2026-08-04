import crypto from "crypto";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Vendor, VendorDocument } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { ActivationToken } from "../models/activationTokenModel.js";
import { notifyUsers, NOTIFICATION_EVENTS } from "../services/notifier.js";
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
  ],
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

  // ── Account state ─────────────────────────────────────────────────────────
  hasAccount: Boolean(vendor.userId),
  accountCreatedAt: vendor.accountCreatedAt,
  accountName: vendor.account?.name ?? null,
  accountEmail: vendor.account?.email ?? null,
  accountStatus: vendor.account?.status ?? null,
  accountActivatedAt: vendor.account?.activatedAt ?? null,
  invitation: invitation !== undefined ? invitation : null,

  // An account may only be created for an approved registration that does not
  // have one yet, and only if an accredited address was captured.
  canCreateAccount:
    vendor.registrationStatus === "verified" && !vendor.userId && Boolean(vendor.contactEmail),

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

// A vendor user always works on their own profile; Secretariat sees all.
const ownProfileFor = async (userId) =>
  Vendor.findOne({ where: { userId }, ...withIncludes });

export const getMyVendorProfile = async (req, res) => {
  const vendor = await ownProfileFor(req.currentUser.id);
  if (!vendor) return res.json(null);
  res.json(serialize(vendor));
};

export const upsertMyVendorProfile = async (req, res) => {
  const { businessName, documents, ...rest } = req.body;

  let vendor = await Vendor.findOne({ where: { userId: req.currentUser.id } });

  // A profile already under review or verified must not be silently edited —
  // it would invalidate the review the BAC already performed.
  if (vendor && ["submitted", "verified"].includes(vendor.registrationStatus)) {
    return res.status(409).json({
      message:
        vendor.registrationStatus === "verified"
          ? "Your registration is verified. Contact the BAC Secretariat to amend it."
          : "Your registration is under review and cannot be edited right now.",
    });
  }

  if (!businessName?.trim()) {
    return res.status(400).json({ message: "Business name is required." });
  }

  await sequelize.transaction(async (transaction) => {
    if (vendor) {
      await vendor.update({ businessName: businessName.trim(), ...rest }, { transaction });
    } else {
      vendor = await Vendor.create(
        {
          businessName: businessName.trim(),
          ...rest,
          userId: req.currentUser.id,
          registrationStatus: "draft",
        },
        { transaction }
      );
    }

    // Documents are replaced wholesale so removing one actually removes it.
    if (Array.isArray(documents)) {
      await VendorDocument.destroy({ where: { vendorId: vendor.id }, transaction });
      await VendorDocument.bulkCreate(
        documents.map((doc) => ({
          vendorId: vendor.id,
          docType: doc.docType,
          label: doc.label,
          citation: doc.citation ?? null,
          fileRef: doc.fileRef ?? null,
          expiryDate: doc.expiryDate ?? null,
          status: "attached",
        })),
        { transaction }
      );
    }
  });

  res.json(serialize(await Vendor.findByPk(vendor.id, withIncludes)));
};

export const submitMyVendorProfile = async (req, res) => {
  const vendor = await ownProfileFor(req.currentUser.id);
  if (!vendor) return res.status(404).json({ message: "Create your registration first." });

  if (!["draft", "returned"].includes(vendor.registrationStatus)) {
    return res.status(409).json({ message: "This registration has already been submitted." });
  }

  // IRR Sec. 52.1 — the PhilGEPS Platinum certificate is the one document the
  // BAC always collects, so refuse a submission without it.
  const hasPhilgeps = (vendor.documents ?? []).some((doc) => doc.docType === "philgeps-platinum");
  if (!hasPhilgeps) {
    return res.status(400).json({
      message: "A PhilGEPS Certificate of Registration (Platinum Membership) is required (IRR Sec. 52.1).",
    });
  }

  await vendor.update({
    registrationStatus: "submitted",
    reviewRemarks: null,
    submittedAt: new Date(),
  });

  // Workflow requirement 11: bidder requirements submitted. The unauthenticated
  // intake path records the same action — this is the equivalent step for a
  // bidder who already holds an account and is amending their accreditation.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.BIDDER_REQUIREMENTS_SUBMITTED,
    entityRef: "vendor",
    entityId: vendor.id,
    summary: `Bidder requirements submitted for ${vendor.businessName}`,
    afterState: {
      businessName: vendor.businessName,
      contactEmail: vendor.contactEmail,
      documentsDeclared: (vendor.documents ?? []).length,
    },
  });

  res.json(serialize(await Vendor.findByPk(vendor.id, withIncludes)));
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

  res.json(serialize(await Vendor.findByPk(vendor.id, withIncludes)));
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 of bidder onboarding: an authorized official creates the account.
//
// This is the gate the whole design turns on. There is no path by which a bidder
// can bring an account into existence — this endpoint is the only one that
// creates a vendor user, it requires the `bidders.createAccount` permission, and
// it will only act on a registration an officer has already marked verified.
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
