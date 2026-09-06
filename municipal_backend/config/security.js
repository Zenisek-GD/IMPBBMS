export const validateProductionConfig = (env = process.env) => {
  if (env.NODE_ENV !== "production") return;
  for (const key of ["SESSION_SECRET", "MFA_ENCRYPTION_KEY"]) {
    if (!env[key] || env[key].length < 32 || /dev-only|replace|changeme/i.test(env[key])) {
      throw new Error(`${key} must be an independently generated secret of at least 32 characters.`);
    }
  }
  if (env.SESSION_SECRET === env.MFA_ENCRYPTION_KEY) throw new Error("Use separate session and MFA keys.");
  let origin;
  try { origin = new URL(env.FRONTEND_ORIGIN); } catch { throw new Error("FRONTEND_ORIGIN is required in production."); }
  if (origin.protocol !== "https:" || origin.origin !== env.FRONTEND_ORIGIN || origin.username || origin.password) {
    throw new Error("FRONTEND_ORIGIN must be an exact HTTPS origin without a trailing slash.");
  }
  for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) {
    if (!env[key]?.trim()) throw new Error(`${key} is required; console mail is prohibited in production.`);
  }
  if (env.CLOUDFLARE_WORKER !== "true") {
    throw new Error("Production requires the durable Cloudflare session and rate-limit stores. Configure a durable store before using standalone Node in production.");
  }
};
