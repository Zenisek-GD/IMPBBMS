import { loadCurrentUser } from "./permissionMiddleware.js";

// Session-only gate: is anybody signed in?
//
// It also loads `req.currentUser`, because a handler behind this middleware
// otherwise has a session id and no user, and every one of them would have to
// fetch the row itself. The permission middleware does the same thing for the
// routes that need a permission check as well — this is the same guarantee for
// the routes that need only "signed in", such as managing your own second
// factor, where there is no permission to check against.
export const requireAuth = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated." });
  }

  const user = await loadCurrentUser(req);
  if (!user) {
    // The session points at an account that has since been deactivated or
    // deleted. Treated as unauthenticated rather than trusted.
    return res.status(401).json({ message: "Not authenticated." });
  }

  req.currentUser = user;
  next();
};
