import crypto from "node:crypto";
import { sequelize } from "../models/db.js";
import { takeDatabaseAttempt, clearDatabaseRateLimit } from "../services/databaseRateLimiter.js";
const WINDOW_MS = 15 * 60 * 1000;
const buckets = new Map();
let workerDb;
if (process.env.CLOUDFLARE_WORKER === "true") {
  const { env } = await import("cloudflare:workers");
  if (!env.SESSIONS) throw new Error("SESSIONS is required for shared rate limiting.");
  workerDb = env.SESSIONS;
}

const standaloneProduction = () => process.env.NODE_ENV === "production" && process.env.CLOUDFLARE_WORKER !== "true";

export const takeAttempt = async (bucket, key, max, { db = workerDb, mysql = standaloneProduction() ? sequelize : null, now = Date.now() } = {}) => {
  const id = crypto.createHmac("sha256", process.env.SESSION_SECRET || "local-rate-limit")
    .update(bucket + ":" + key).digest("hex");
  if (db) {
    const row = await db.prepare(
      "INSERT INTO rate_limits (key, attempts, expires_at) VALUES (?, 1, ?) " +
      "ON CONFLICT(key) DO UPDATE SET " +
      "attempts = CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE MIN(rate_limits.attempts + 1, ?) END, " +
      "expires_at = CASE WHEN rate_limits.expires_at <= ? THEN excluded.expires_at ELSE rate_limits.expires_at END " +
      "RETURNING attempts, expires_at"
    ).bind(id, now + WINDOW_MS, now, max + 1, now).first();
    return { allowed: row.attempts <= max, retryAfter: Math.max(1, Math.ceil((row.expires_at - now) / 1000)) };
  }
  // A storage failure rejects the request; production never falls back to the
  // per-process map and cannot reset its ceiling by restarting a Node worker.
  if (mysql) return takeDatabaseAttempt(id, max, now, WINDOW_MS, mysql);
  // Local development only. Bound memory under address churn.
  for (const [storedKey, row] of buckets) if (row.expires_at <= now) buckets.delete(storedKey);
  let row = buckets.get(id);
  if (!row && buckets.size >= 10000) return { allowed: false, retryAfter: 900 };
  if (!row) { row = { attempts: 0, expires_at: now + WINDOW_MS }; buckets.set(id, row); }
  row.attempts = Math.min(row.attempts + 1, max + 1);
  return { allowed: row.attempts <= max, retryAfter: Math.max(1, Math.ceil((row.expires_at - now) / 1000)) };
};

export const rateLimit = ({ bucket, max, key = (req) => req.ip }) => (req, res, next) => {
  takeAttempt(bucket, key(req), max).then((result) => {
    if (result.allowed) return next();
    res.setHeader("Retry-After", result.retryAfter);
    res.status(429).json({ message: "Too many attempts. Please try again in a few minutes." });
  }).catch(next);
};

// A successful password check is not a failed guess. Clear the matching
// counter without making authentication wait on best-effort storage cleanup.
export const clearRateLimit = (bucket, key) => {
  const id = crypto.createHmac("sha256", process.env.SESSION_SECRET || "local-rate-limit")
    .update(bucket + ":" + key).digest("hex");
  buckets.delete(id);
  if (workerDb) workerDb.prepare("DELETE FROM rate_limits WHERE key = ?").bind(id).run().catch(() => {});
  else if (standaloneProduction()) clearDatabaseRateLimit(id).catch(() => {});
};
