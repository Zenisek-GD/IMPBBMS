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
