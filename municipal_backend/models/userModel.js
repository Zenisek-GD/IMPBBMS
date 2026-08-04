import { DataTypes } from "sequelize";
import bcrypt from "bcrypt";
import { sequelize } from "./db.js";
import { Role } from "./roleModel.js";
import { Department } from "./departmentModel.js";

// ── Per-account appearance ───────────────────────────────────────────────────
// Theme lives on the user record, not in the browser. Two officers sharing a
// workstation each get their own setting, and an officer who moves between
// machines keeps theirs — neither of which is true of a localStorage-only
// toggle. "system" defers to the operating system's own light/dark setting.
export const THEME_PREFERENCES = ["system", "light", "dark"];

// ── Account lifecycle ────────────────────────────────────────────────────────
// An account created by an official for an approved bidder does not start usable.
// It starts as `pendingActivation`: it exists, it holds the accredited email, and
// it cannot be signed into. It becomes `active` only when the invited bidder has
// followed their activation link, set their own password, and proved control of
// that mailbox with a one-time code.
//
// This is what makes "no public registration" more than a missing sign-up form —
// the account is inert until the person who was accredited demonstrates they hold
// the address the accreditation was granted against.
export const USER_STATUSES = ["pendingActivation", "active", "inactive"];

// Whether the navigation sidebar is collapsed to icons. Also per-account, for
// the same reason: it is a personal working preference, not a device setting.
export const User = sequelize.define("User", {
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  status: {
    type: DataTypes.ENUM(...USER_STATUSES),
    allowNull: false,
    defaultValue: "active",
  },

  // When the holder completed activation. Null for accounts seeded directly and
  // for invitations still outstanding.
  activatedAt: { type: DataTypes.DATE, allowNull: true },

  // When the password was last set by its owner. Used to show an officer that an
  // account is still on a credential nobody has ever rotated; never used to
  // reveal anything about the password itself.
  passwordChangedAt: { type: DataTypes.DATE, allowNull: true },

  themePreference: {
    type: DataTypes.ENUM(...THEME_PREFERENCES),
    allowNull: false,
    defaultValue: "system",
  },
  sidebarCollapsed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
});

User.belongsTo(Role, { foreignKey: "roleId", allowNull: false });
Role.hasMany(User, { foreignKey: "roleId" });

// Nullable on purpose: external roles (Vendor/Supplier, Observer) do not
// belong to a municipal office.
User.belongsTo(Department, { foreignKey: "departmentId" });
Department.hasMany(User, { foreignKey: "departmentId" });

// Design doc, Section 2.2: "No self-registration for internal users — accounts
// are created only by the System Administrator." Passwords therefore only
// ever arrive here via an admin-created record, the activation flow, or the seed
// script, so hashing on create/update covers every path.
//
// bcrypt with a per-password salt at cost 12. The cost is the point: it makes
// each guess expensive, so a stolen table of hashes cannot be run through a
// dictionary at speed. 12 rather than 10 because the hardware that verifies one
// login per sign-in has plenty of headroom, while the hardware that would attack
// the table benefits from every halving of the work factor.
const BCRYPT_COST = 12;

User.beforeCreate(async (user) => {
  user.password = await bcrypt.hash(user.password, BCRYPT_COST);
});
User.beforeUpdate(async (user) => {
  if (user.changed("password")) {
    user.password = await bcrypt.hash(user.password, BCRYPT_COST);
  }
});

User.prototype.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

export { sequelize };
