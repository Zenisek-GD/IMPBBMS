import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { Permission } from "../models/permissionModel.js";

// A password change or reset must invalidate every *other* session the account
// had open — otherwise recovering a compromised account leaves the intruder
// signed in. Each session records when it authenticated (`authAt`); a session
// that authenticated before the account's most recent password change is no
// longer trusted. The grace window absorbs the sub-second rounding of the
// DATETIME column so the very session that just changed the password — which
// re-stamps its own `authAt` — is never caught by its own change.
const PW_SESSION_GRACE_MS = 2000;

export const passwordSessionValid = (req, user) => {
  const changed = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
  if (!changed) return true; // never changed (e.g. seeded accounts) — nothing to invalidate against
  const authAt = req.session?.authAt ?? 0;
  return authAt >= changed - PW_SESSION_GRACE_MS;
};

// Loads the caller with their role's permission set. Read fresh per request so
// revoking a permission takes effect immediately, not at next login.
export const loadCurrentUser = async (req) => {
  if (!req.session.userId) return null;

  const user = await User.findByPk(req.session.userId, {
    include: [{ model: Role, include: [Permission] }],
  });

  if (!user || user.status !== "active") return null;
  // Stale session from before a password change/reset — refuse it.
  if (!passwordSessionValid(req, user)) return null;
  return user;
};

export const permissionsOf = (user) =>
  new Set((user.Role?.Permissions ?? []).map((permission) => permission.key));

// Design doc Section 2.2: no implicit or inherited access — a role holds a
// permission only if the join table says so.
export const requirePermission = (...required) => async (req, res, next) => {
  const user = await loadCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });

  const held = permissionsOf(user);
  const missing = required.filter((permission) => !held.has(permission));

  if (missing.length) {
    return res.status(403).json({
      message: "You do not have permission to perform this action.",
      required: missing,
    });
  }

  req.currentUser = user;
  req.permissions = held;
  next();
};

// For endpoints where any one of several permissions is enough (e.g. viewing
// the full record vs. the published-only view).
export const requireAnyPermission = (...accepted) => async (req, res, next) => {
  const user = await loadCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });

  const held = permissionsOf(user);
  if (!accepted.some((permission) => held.has(permission))) {
    return res.status(403).json({
      message: "You do not have permission to perform this action.",
      required: accepted,
    });
  }

  req.currentUser = user;
  req.permissions = held;
  next();
};
