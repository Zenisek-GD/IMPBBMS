import { QueryTypes } from "sequelize";
import { RateLimitBucket } from "../models/rateLimitModel.js";

export const takeDatabaseAttempt = async (id, max, now, windowMs, db = RateLimitBucket.sequelize) =>
  db.transaction(async (transaction) => {
    // The upsert locks this counter until the read and commit finish. Separate
    // workers cannot read the same increment or lose attempts under contention.
    await db.query(
      "INSERT INTO `ratelimitbuckets` (`id`, `attempts`, `expiresAt`) VALUES (?, 1, ?) " +
      "ON DUPLICATE KEY UPDATE " +
      "`attempts` = IF(`expiresAt` <= ?, 1, LEAST(`attempts` + 1, ?)), " +
      "`expiresAt` = IF(`expiresAt` <= ?, ?, `expiresAt`)",
      { replacements: [id, now + windowMs, now, max + 1, now, now + windowMs], transaction },
    );
    const [row] = await db.query(
      "SELECT `attempts`, `expiresAt` FROM `ratelimitbuckets` WHERE `id` = ?",
      { replacements: [id], transaction, type: QueryTypes.SELECT },
    );
    return { allowed: row.attempts <= max, retryAfter: Math.max(1, Math.ceil((Number(row.expiresAt) - now) / 1000)) };
  });

export const clearDatabaseRateLimit = (id, db = RateLimitBucket.sequelize) => db.query(
  "DELETE FROM `ratelimitbuckets` WHERE `id` = ?", { replacements: [id] },
);

export const startDatabaseRateLimitSweep = () => {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // Bound each sweep, using the expiry index rather than loading accounts.
      await RateLimitBucket.sequelize.query(
        "DELETE FROM `ratelimitbuckets` WHERE `expiresAt` <= ? LIMIT 1000",
        { replacements: [Date.now()] },
      );
    } catch { console.error("[security] rate-limit cleanup failed"); }
    finally { running = false; }
  }, 60_000);
  timer.unref();
  return timer;
};
