import crypto from "crypto";
import { Op } from "sequelize";
import { sequelize } from "../models/db.js";
import { Vendor, VendorDocument } from "../models/vendorModel.js";
import { User } from "../models/userModel.js";
import { recordAudit, AUDIT_ACTIONS } from "../services/auditLog.js";
import { sendIntakeAcknowledgementEmail } from "../services/mailer.js";
import { notifyByPermission, NOTIFICATION_EVENTS } from "../services/notifier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 of bidder onboarding: an applicant hands in their eligibility,
// compliance and accreditation requirements. No account exists at this point and
// none is created here — this endpoint cannot grant access to anything. It
// records an application for the BAC Secretariat to review, and it captures the
// email address that every later step is bound to.
//
// This is the only unauthenticated write in the system. It is therefore
// deliberately narrow: it can create exactly one kind of row, in exactly one
// status, with no role, no permissions and no credential of any kind.
// ─────────────────────────────────────────────────────────────────────────────

const ORGANIZATION_TYPES = ["corporation", "partnership", "soleProprietorship", "cooperative"];
const TAX_CLASSIFICATIONS = ["goods", "services"];

// Not sequential. A running number would publish how many bidders have applied
// and would let any applicant guess the next reference along.
const generateReferenceCode = () => {
  // Crockford-ish alphabet: no I, O, 1 or 0, so a code read off a screen and
  // typed into a phone call does not get transcribed wrongly.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const body = Array.from(
    crypto.randomBytes(8),
    (byte) => alphabet[byte % alphabet.length]
  ).join("");
  return `BR-${new Date().getFullYear()}-${body}`;
};

// Deliberately conservative. This is not an attempt to prove an address is
// deliverable — only the acknowledgement email can do that, which is one of the
// reasons it is sent — but it rejects the obviously malformed before a message is
// queued to it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@,]+\.[a-z]{2,}$/i;

const normaliseEmail = (value) => String(value ?? "").trim().toLowerCase();

// Every submission gets this response, whatever actually happened inside.
//
// The alternative — telling the caller "that address already has a registration"
// or "that address already has an account" — turns a public form into a way to
// test whether any given company is registered with this LGU, and whether it
// holds an account. The reference code and the true state of the application go
// to the mailbox instead, which only its owner can read. That the response is
// uniform is also why the acknowledgement email matters: it is the applicant's
// only confirmation, and an address that cannot receive it will not receive
// anything else this system sends either.
const UNIFORM_RESPONSE = {
  received: true,
  message:
    "Your requirements have been received. We have emailed a confirmation and your " +
    "reference number to the address you provided — please check it, including your " +
    "spam folder. If you do not receive it, the address may be mistyped: contact the " +
    "BAC Secretariat before resubmitting.",
};

export const submitBidderRequirements = async (req, res) => {
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
  } = req.body ?? {};

  // ── Validation ────────────────────────────────────────────────────────────
  // These are the fields an officer cannot review a registration without, so
  // they are refused outright rather than stored half-complete. Field-level
  // errors are safe to return: they describe the caller's own input and reveal
  // nothing about what is already in the system.
  const errors = {};

  const cleanBusinessName = String(businessName ?? "").trim();
  if (!cleanBusinessName) errors.businessName = "Registered business name is required.";
  else if (cleanBusinessName.length > 200) errors.businessName = "That name is too long.";

  const cleanContactPerson = String(contactPerson ?? "").trim();
  if (!cleanContactPerson) errors.contactPerson = "An authorized contact person is required.";

  // Workflow requirement 1. This is the one field the entire onboarding chain
  // hangs off, so it gets the strictest treatment on the form.
  const email = normaliseEmail(contactEmail);
  if (!email) errors.contactEmail = "An active email address is required.";
  else if (!EMAIL_PATTERN.test(email)) errors.contactEmail = "Enter a valid email address.";
  else if (email.length > 190) errors.contactEmail = "That email address is too long.";

  if (organizationType && !ORGANIZATION_TYPES.includes(organizationType)) {
    errors.organizationType = "Choose a valid organization type.";
  }
  if (taxClassification && !TAX_CLASSIFICATIONS.includes(taxClassification)) {
    errors.taxClassification = "Choose a valid tax classification.";
  }

  // IRR Sec. 52.1 — the PhilGEPS Platinum certificate is the one document the BAC
  // always collects, so a submission without it cannot be reviewed. Enforced here
  // as well as on the authenticated wizard, because this path does not go through
  // submitMyVendorProfile.
  const declared = Array.isArray(documents) ? documents : [];
  if (!declared.some((doc) => doc?.docType === "philgeps-platinum")) {
    errors.documents =
      "A PhilGEPS Certificate of Registration (Platinum Membership) must be declared (IRR Sec. 52.1).";
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: "Please correct the highlighted fields.", errors });
  }

  // ── Duplicate handling ────────────────────────────────────────────────────
  // Checked, but never reported to the caller. A live application or an existing
  // account for this address means no new row: the applicant is told by email
  // what state they are actually in, and the officials' queue is not filled with
  // duplicates of the same business.
  const [existingRegistration, existingAccount] = await Promise.all([
    Vendor.findOne({
      where: {
        contactEmail: email,
        registrationStatus: { [Op.in]: ["submitted", "verified"] },
      },
    }),
    User.findOne({ where: { email } }),
  ]);

  if (existingRegistration || existingAccount) {
    await recordAudit({
      actionType: AUDIT_ACTIONS.BIDDER_REQUIREMENTS_SUBMITTED,
      outcome: "denied",
      entityRef: "vendor",
      entityId: existingRegistration?.id ?? null,
      summary: `Duplicate bidder requirements submission for ${cleanBusinessName} — an application or account already exists for this address`,
      actorName: `${cleanContactPerson} (unauthenticated applicant)`,
      ipAddress: req.ip,
      afterState: { businessName: cleanBusinessName, contactEmail: email },
    });

    // Same body, same status as a successful submission.
    return res.status(202).json(UNIFORM_RESPONSE);
  }

  // A returned registration is amended in place rather than duplicated, so the
  // review history of that business stays on one record.
  const returned = await Vendor.findOne({
    where: { contactEmail: email, registrationStatus: "returned" },
  });

  const referenceCode = returned?.referenceCode ?? generateReferenceCode();
  const now = new Date();

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
    // Straight to `submitted`: this endpoint exists to hand in a completed
    // application, and there is no account through which a draft could later be
    // picked up and finished.
    registrationStatus: "submitted",
    submittedAt: now,
    reviewRemarks: null,
    // Explicitly cleared. A resubmission after a return is a fresh application
    // as far as the review is concerned.
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
          // No file arrives on this path. The declaration is what is recorded;
          // the files themselves are collected by the Secretariat, and once the
          // bidder has an account they can upload them against this record.
          fileRef: null,
          status: "attached",
        })),
      { transaction }
    );

    return record;
  });

  // Workflow requirement 11: bidder requirements submitted.
  //
  // There is no actor id — nobody was signed in, which is the point — so the
  // applicant is identified by the details they supplied and by their IP. Note
  // that nothing secret is recorded here: an application carries no credential.
  await recordAudit({
    actionType: AUDIT_ACTIONS.BIDDER_REQUIREMENTS_SUBMITTED,
    entityRef: "vendor",
    entityId: vendor.id,
    summary: `Bidder requirements submitted for ${cleanBusinessName} (${referenceCode})`,
    actorName: `${cleanContactPerson} (unauthenticated applicant)`,
    ipAddress: req.ip,
    afterState: {
      referenceCode,
      businessName: cleanBusinessName,
      contactEmail: email,
      organizationType: profile.organizationType,
      philgepsRegistrationNo: profile.philgepsRegistrationNo,
      documentsDeclared: declared.length,
      resubmission: Boolean(returned),
    },
  });

  // Proves the address can actually receive mail before an officer spends time on
  // the papers — and if it cannot, the applicant finds out now rather than after
  // an invitation has been issued to a dead mailbox.
  await sendIntakeAcknowledgementEmail({
    to: email,
    businessName: cleanBusinessName,
    contactName: cleanContactPerson,
    referenceCode,
  });

  // The queue this lands in belongs to whoever verifies registrations.
  await notifyByPermission("bidding.publish", {
    type: NOTIFICATION_EVENTS.BIDDER_REQUIREMENTS_SUBMITTED,
    title: "New bidder registration to review",
    body: `${cleanBusinessName} submitted eligibility requirements (${referenceCode}).`,
    link: "/secretariat/vendors",
    refEntity: "vendor",
    refId: vendor.id,
    severity: "info",
  });

  res.status(202).json(UNIFORM_RESPONSE);
};
