import "./env.js";
if (process.env.NODE_ENV !== "development" || process.env.CLOUDFLARE_WORKER === "true") {
  throw new Error("Demo accounts, seed data and authenticator helpers are prohibited in production.");
}
