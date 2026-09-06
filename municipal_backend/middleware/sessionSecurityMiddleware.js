import { sessionExpired, SESSION_EXPIRED_MESSAGE } from "../services/authPolicy.js";
import { destroyLoginSession } from "../services/loginSession.js";
import { LoginSession } from "../models/authSecurityModel.js";
import { expireStoredSession } from "../services/sessionStore.js";
import { hashToken } from "../services/authPolicy.js";

export const sessionSecurity = async (req, res, next) => {
  res.set("Cache-Control", "no-store, private");
  res.set("Pragma", "no-cache");

  if (!sessionExpired(req.session)) return next();
  const row = await LoginSession.findByPk(hashToken(req.sessionID));
  if (row && !row.endedAt) await expireStoredSession(row);
  await destroyLoginSession(req, res);
  // A new credential submission may immediately start a fresh sign-in.
  if (req.path === "/api/auth/login") {
    req.sessionStore.generate(req);
    return next();
  }
  return res.status(401).json({ code: "SESSION_EXPIRED", message: SESSION_EXPIRED_MESSAGE });
};

// SameSite is defense in depth. Reject browser writes from any other origin,
// including a different (same-site) sibling host.
export const requireSameOrigin = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  const allowed = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
  if ((origin && origin !== allowed) || (!origin && req.get("sec-fetch-site") === "cross-site")) {
    return res.status(403).json({ message: "This request origin is not allowed." });
  }
  next();
};
