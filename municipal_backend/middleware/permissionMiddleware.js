import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";
import { Permission } from "../models/permissionModel.js";

// Loads the caller with their role's permission set. Read fresh per request so
// revoking a permission takes effect immediately, not at next login.
export const loadCurrentUser = async (req) => {
  if (!req.session.userId) return null;

  const user = await User.findByPk(req.session.userId, {
    include: [{ model: Role, include: [Permission] }],
  });

  if (!user || user.status !== "active") return null;
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
