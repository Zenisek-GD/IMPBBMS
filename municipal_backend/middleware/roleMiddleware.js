import { User } from "../models/userModel.js";
import { Role } from "../models/roleModel.js";

// Design doc Section 2.2: "Every role has an explicit, enumerated permission
// set — no implicit or inherited access." Role is re-read from the database on
// every request rather than trusted from the session, so revoking or changing
// a role takes effect immediately instead of at next login.
export const requireRole = (...allowedRoles) => async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated." });
  }

  const user = await User.findByPk(req.session.userId, { include: Role });
  if (!user || user.status !== "active") {
    return res.status(401).json({ message: "Not authenticated." });
  }

  if (!allowedRoles.includes(user.Role.key)) {
    return res.status(403).json({ message: "You do not have access to this resource." });
  }

  req.currentUser = user;
  next();
};
