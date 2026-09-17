import { loadCurrentUser, permissionsOf } from "./permissionMiddleware.js";

export const requireTwoFactorManagement = async (req, res, next) => {
  const user = await loadCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });
  const permissions = permissionsOf(user);
  if (user.Role?.key !== "systemAdministrator" && !permissions.has("manage_two_factor_authentication")) {
    return res.status(403).json({ message: "You do not have permission to manage role two-factor authentication." });
  }
  req.currentUser = user;
  req.permissions = permissions;
  next();
};

// A delegated MFA manager can administer role-level MFA requirements, but the
// browser-session lifetime is a system-wide authentication boundary. Keep that
// setting with the System Administrator rather than broadening the existing
// delegated permission.
export const requireSystemAdministrator = async (req, res, next) => {
  const user = await loadCurrentUser(req);
  if (!user) return res.status(401).json({ message: "Not authenticated." });
  if (user.Role?.key !== "systemAdministrator") {
    return res.status(403).json({ message: "You do not have permission to manage the session security policy." });
  }
  req.currentUser = user;
  req.permissions = permissionsOf(user);
  next();
};
