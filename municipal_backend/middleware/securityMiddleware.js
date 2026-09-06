import { isAllowedFrontendOrigin } from "../config/frontendOrigins.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// All browser mutations must originate from the configured UI and carry a
// non-simple header. Cross-origin forms cannot set it; fetch must preflight.
// CORS only grants that preflight to an allowed frontend origin.
export const protectRequests = (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000");
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get("origin");
  if ((origin && !isAllowedFrontendOrigin(origin)) || req.get("sec-fetch-site") === "cross-site" || req.get("x-requested-with") !== "XMLHttpRequest") {
    return res.status(403).json({ message: "Request origin verification failed." });
  }
  next();
};
