import crypto from "crypto";
import { Op } from "sequelize";
import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { Department } from "../models/departmentModel.js";
import { validatePassword } from "./passwordResetController.js";
import { auditFromRequest, AUDIT_ACTIONS } from "../services/auditLog.js";
import { issueActivationToken } from "../services/activation.js";
import { sendActivationInvitation } from "../services/mailer.js";

const serialize = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: user.status,
  role: user.Role?.key ?? null,
  roleName: user.Role?.name ?? null,
  departmentId: user.departmentId ?? null,
  departmentName: user.Department?.name ?? null,
  departmentCode: user.Department?.code ?? null,
  createdAt: user.createdAt,
});

// Vendors and Observers are external to the LGU, so they are never attached to
// a municipal office.
const EXTERNAL_ROLES = ["vendor", "observer"];

export const listRoles = async (req, res) => {
  const roles = await Role.findAll({
    include: [{ model: Department, as: "defaultDepartment" }],
    order: [["name", "ASC"]],
  });

  res.json(
    roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      isExternal: EXTERNAL_ROLES.includes(role.key),
      // Only offer the default if the office is still active, otherwise the
      // form would pre-fill a department the API will reject.
      defaultDepartmentId:
        role.defaultDepartment?.status === "active" ? role.defaultDepartment.id : null,
      defaultDepartmentName: role.defaultDepartment?.name ?? null,
    }))
  );
};

export const listUsers = async (req, res) => {
  const { search, role, status, department } = req.query;

  const where = {};
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
  }
  if (status) where.status = status;
  if (department) where.departmentId = department;

  const users = await User.findAll({
    where,
    include: [{ model: Role, ...(role ? { where: { key: role } } : {}) }, { model: Department }],
    order: [["createdAt", "DESC"]],
  });

  res.json(users.map(serialize));
};

export const createUser = async (req, res) => {
  const { name, email, roleId, password, departmentId } = req.body;

  if (!name || !email || !roleId || !password) {
    return res.status(400).json({ message: "Name, email, role, and password are required." });
  }

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });

  const roleRecord = await Role.findByPk(roleId);
  if (!roleRecord) return res.status(400).json({ message: "That role does not exist." });

  // A bidder account cannot be created here, by anybody, including the System
  // Administrator.
  //
  // This form takes an arbitrary email address and a password chosen by whoever
  // is filling it in. Allowing a vendor account through it would defeat the two
  // guarantees the onboarding flow exists to provide: that an account only exists
  // once an official has reviewed and approved that bidder's requirements, and
  // that the only address it can be created against is the one that approval was
  // granted for. Bidder accounts are created from the reviewed registration, in
  // vendorController.createBidderAccount, with no email field to type into.
  if (roleRecord.key === "vendor") {
    await auditFromRequest(req, {
      actionType: AUDIT_ACTIONS.USER_CREATED,
      outcome: "denied",
      entityRef: "user",
      summary: `Refused to create a bidder account directly for ${email} — must be created from an approved registration`,
      afterState: { attemptedEmail: email, attemptedRole: "vendor" },
    });
    return res.status(400).json({
      message:
        "Bidder accounts cannot be created here. A bidder's account is created from their " +
        "approved registration in Vendor Verification, so that it can only ever be issued " +
        "against the email address their accreditation was approved for.",
    });
  }

  const departmentError = await resolveDepartment(roleRecord.key, departmentId);
  if (departmentError.message) return res.status(400).json({ message: departmentError.message });

  const normalisedEmail = String(email).trim().toLowerCase();
  if (await User.findOne({ where: { email: normalisedEmail } })) {
    return res.status(409).json({ message: "An account with that email already exists." });
  }

  const user = await User.create({
    name,
    email: normalisedEmail,
    roleId,
    password,
    status: "active",
    departmentId: departmentError.value,
    passwordChangedAt: new Date(),
  });

  // Workflow requirement 11: account creation by an official.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.USER_CREATED,
    entityRef: "user",
    entityId: user.id,
    summary: `Account created for ${normalisedEmail} as ${roleRecord.name}`,
    afterState: {
      accountEmail: normalisedEmail,
      displayName: user.name,
      role: roleRecord.key,
      departmentId: departmentError.value,
      status: "active",
      // No password field, in any form. The `password` variable above never
      // reaches the log — and redactSecrets in services/auditLog.js would strip
      // it even if a later edit tried to include it.
    },
  });

  const created = await User.findByPk(user.id, { include: [Role, Department] });
  res.status(201).json(serialize(created));
};

// Internal roles must sit in an active department; external ones must not sit
// in any. Returns { value } to assign, or { message } describing the problem.
async function resolveDepartment(roleKey, departmentId) {
  if (EXTERNAL_ROLES.includes(roleKey)) {
    return { value: null };
  }

  if (!departmentId) {
    return { message: "Internal users must be assigned to a department." };
  }

  const department = await Department.findByPk(departmentId);
  if (!department) return { message: "That department does not exist." };
  if (department.status !== "active") {
    return { message: "That department is inactive." };
  }

  return { value: department.id };
}

export const updateUser = async (req, res) => {
  const { name, email, roleId, status, departmentId } = req.body;
  const user = await User.findByPk(req.params.id, { include: [Role, Department] });
  if (!user) return res.status(404).json({ message: "User not found." });

  // Guard against an administrator locking themselves out of the console.
  const isSelf = user.id === req.currentUser.id;
  if (isSelf && status === "inactive") {
    return res.status(400).json({ message: "You cannot deactivate your own account." });
  }
  if (isSelf && roleId && roleId !== user.roleId) {
    return res.status(400).json({ message: "You cannot change your own role." });
  }

  if (email && email !== user.email) {
    const taken = await User.findOne({ where: { email, id: { [Op.ne]: user.id } } });
    if (taken) return res.status(409).json({ message: "An account with that email already exists." });
  }

  // Role and department are validated together: switching between an internal
  // and an external role changes whether a department is required at all.
  let effectiveRoleKey = user.Role.key;
  if (roleId) {
    const roleRecord = await Role.findByPk(roleId);
    if (!roleRecord) return res.status(400).json({ message: "That role does not exist." });
    user.roleId = roleId;
    effectiveRoleKey = roleRecord.key;
  }

  const nextDepartmentId = departmentId !== undefined ? departmentId : user.departmentId;
  const departmentResult = await resolveDepartment(effectiveRoleKey, nextDepartmentId);
  if (departmentResult.message) return res.status(400).json({ message: departmentResult.message });
  user.departmentId = departmentResult.value;

  const before = {
    displayName: user.name,
    accountEmail: user.email,
    role: user.Role.key,
    status: user.status,
    departmentId: user.departmentId,
  };

  if (name) user.name = name;
  if (email) user.email = String(email).trim().toLowerCase();
  if (status) user.status = status;
  await user.save();

  const updated = await User.findByPk(user.id, { include: [Role, Department] });

  // Workflow requirement 11 (profile updates / other critical actions). An
  // administrator editing somebody else's account is exactly the kind of action
  // the log exists for, and a change of email address on a bidder's account is the
  // most consequential of them — it moves the channel that account's activation,
  // notices and password recovery all depend on. Any outstanding invitation stops
  // working when this happens, by design: see resolveActivationToken.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.USER_UPDATED,
    entityRef: "user",
    entityId: user.id,
    summary:
      before.accountEmail !== updated.email
        ? `Account email for ${before.accountEmail} changed to ${updated.email} by ${req.currentUser.name}`
        : `Account ${updated.email} updated by ${req.currentUser.name}`,
    beforeState: before,
    afterState: {
      displayName: updated.name,
      accountEmail: updated.email,
      role: updated.Role.key,
      status: updated.status,
      departmentId: updated.departmentId,
    },
  });

  res.json(serialize(updated));
};

// ─────────────────────────────────────────────────────────────────────────────
// Administrator-initiated credential reset.
//
// This used to generate a temporary password and return it to the administrator's
// screen, for the administrator to read out to the user. That is now forbidden on
// two counts — a password must never be displayed in the interface, and a
// credential known to a second person is not a credential — so the mechanism has
// been replaced rather than patched.
//
// What happens instead: the account is put back into `pendingActivation` and an
// invitation is emailed to its registered address. The holder follows it, sets a
// password only they ever know, and confirms the mailbox with a one-time code —
// the same path a new bidder takes. The administrator learns nothing except
// whether the email went out.
//
// The trade-off is deliberate: the account cannot be signed into between the reset
// and the holder completing it. For a reset performed because a credential is
// suspected compromised, that is the desired behaviour, not a side effect. A user
// who has merely forgotten their password does not need this endpoint at all —
// "Forgot password" sends them a code without an administrator being involved.
// ─────────────────────────────────────────────────────────────────────────────
export const resetUserPassword = async (req, res) => {
  const user = await User.findByPk(req.params.id, { include: [Role] });
  if (!user) return res.status(404).json({ message: "User not found." });

  if (user.id === req.currentUser.id) {
    return res.status(400).json({
      message:
        "Use “Change password” for your own account. Resetting it here would lock you out " +
        "of this console until you completed the emailed invitation.",
    });
  }

  if (!user.email) {
    return res.status(400).json({
      message: "This account has no email address, so no reset invitation can be sent.",
    });
  }

  // 64 random bytes, hashed and forgotten. The old password must not survive the
  // reset, and the replacement must be something nobody holds — see the note on
  // unusablePassword in vendorController.js.
  user.password = crypto.randomBytes(64).toString("hex");
  user.status = "pendingActivation";
  await user.save();

  const issued = await issueActivationToken({ user, issuedByUserId: req.currentUser.id });

  const result = await sendActivationInvitation({
    to: user.email,
    businessName: user.Role?.name ?? "your account",
    contactName: user.name,
    activationUrl: issued.url,
    expiresInHours: issued.expiresInHours,
    invitedBy: `${req.currentUser.name} (System Administrator)`,
  });

  const emailSent = !result.error;
  if (emailSent) await issued.record.update({ sentAt: new Date() });

  // Workflow requirement 11: password reset requests, recorded against the
  // official who initiated it rather than the account holder — they did not ask
  // for this, and the log has to show who did.
  await auditFromRequest(req, {
    actionType: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    outcome: emailSent ? "success" : "failed",
    entityRef: "user",
    entityId: user.id,
    summary: `Credential reset initiated for ${user.email} by ${req.currentUser.name}`,
    afterState: {
      accountEmail: user.email,
      status: "pendingActivation",
      invitationSent: emailSent,
      invitationExpiresAt: issued.record.expiresAt,
      error: result.error ?? null,
    },
  });

  res.json({
    message: emailSent
      ? `An invitation to set a new password has been emailed to ${user.email}. ` +
        `It expires in ${issued.expiresInHours} hours. The account cannot be used until they complete it.`
      : `The account was reset, but the email could not be sent (${result.error}). Try again once mail is working.`,
    emailSent,
    emailError: result.error ?? null,
    // Deliberately no password field. There is no password to report: the one on
    // the account is random and unknown, and the real one will be chosen by its
    // holder and never leave their browser except as a bcrypt hash.
  });
};
