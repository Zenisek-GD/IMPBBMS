// Design doc Section 12: "Rate limiting on public-facing and authentication
// endpoints." In-memory and per-process, which is fine for a single Node
// instance — move to Redis if this is ever run behind multiple workers.
const WINDOW_MS = 15 * 60 * 1000;

const buckets = new Map();

const bucketFor = (name) => {
  if (!buckets.has(name)) buckets.set(name, new Map());
  return buckets.get(name);
};

// Drop stale entries so the maps can't grow without bound.
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const bucket of buckets.values()) {
    for (const [key, timestamps] of bucket) {
      const recent = timestamps.filter((time) => time > cutoff);
      if (recent.length) bucket.set(key, recent);
      else bucket.delete(key);
    }
  }
}, WINDOW_MS).unref();

// Each endpoint gets its own bucket on purpose: someone who mistypes their
// password repeatedly must still be able to request a reset link, so a shared
// counter across login/forgot/reset would lock them out of the fix.
export const rateLimit = ({ bucket, max }) => (req, res, next) => {
  const store = bucketFor(bucket);
  const key = req.ip;
  const cutoff = Date.now() - WINDOW_MS;
  const recent = (store.get(key) ?? []).filter((time) => time > cutoff);

  if (recent.length >= max) {
    return res.status(429).json({
      message: "Too many attempts. Please try again in a few minutes.",
    });
  }

  recent.push(Date.now());
  store.set(key, recent);
  next();
};

// Forgets an address's attempts on a bucket.
//
// Rate limiting on sign-in exists to stop someone guessing passwords, and a
// *successful* sign-in is not a guess. Counting it meant a legitimate user
// moving between accounts — an administrator checking how a screen looks to
// each role, say — could lock themselves out with ten correct passwords in a
// row, while an attacker's failures cost exactly the same. Clearing on success
// keeps the ceiling firmly against failures, which is what it is for.
export const clearRateLimit = (bucket, key) => {
  buckets.get(bucket)?.delete(key);
};
