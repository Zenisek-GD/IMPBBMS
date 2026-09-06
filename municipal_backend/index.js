/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
// Must come first: everything below reads process.env at module scope, and
// models/db.js builds its connection from it the moment it is imported.
import "./config/env.js";

import express from "express";
import path from "path";
import session from "express-session";
import { DatabaseSessionStore, startAuthExpirationSweep } from "./services/sessionStore.js";
import cors from "cors";
import { validateProductionConfig } from "./config/security.js";
import { isAllowedFrontendOrigin } from "./config/frontendOrigins.js";
import { protectRequests } from "./middleware/securityMiddleware.js";
import { rateLimit } from "./middleware/rateLimitMiddleware.js";
import router from "./routes/index.js";
import { wrapRouterStack, errorHandler } from "./middleware/asyncHandler.js";
validateProductionConfig();
const app = express();
app.disable("x-powered-by");
app.set("query parser", "simple");
// Only the Worker adapter is trusted to supply forwarded headers.
if (process.env.CLOUDFLARE_WORKER === "true") app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
// Configure only the proxy addresses/hops actually used by this deployment.
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : process.env.TRUST_PROXY);

// The Worker serves the SPA and API from the same workers.dev origin, so it
// does not need CORS at all. Keeping CORS local-only avoids advertising the
// localhost origin to production browsers and keeps the session cookie
// first-party.
if (process.env.CLOUDFLARE_WORKER !== "true") {
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || isAllowedFrontendOrigin(origin));
    },
    credentials: true,
  }));
}
app.use(protectRequests);
app.use("/api", rateLimit({ bucket: "api", max: 900 }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));
if (process.env.CLOUDFLARE_WORKER !== "true") {
  app.use(express.static(path.join(process.cwd(), "public")));
}

// Production configuration is validated above before serving requests.
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret";

// A MemoryStore is suitable only for the single, long-running local Node
// process. Worker isolates are intentionally ephemeral, so Cloudflare uses a
// D1-backed store loaded only in that runtime. Dynamic import keeps Node local
// development free of Worker-only module imports.
const sessionStore = process.env.CLOUDFLARE_WORKER === "true"
  ? (await import("./services/cloudflareSessionStore.js")).createCloudflareSessionStore()
  : new DatabaseSessionStore();

app.use(session({
  secret: SESSION_SECRET,
  rolling: false,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  name: process.env.NODE_ENV === "production" ? "__Host-procurenance.sid" : "connect.sid",
  cookie: {
    maxAge: 5 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
    // Requires HTTPS in production; left off locally so development works.
    secure: process.env.NODE_ENV === "production",
  },
}));

// The hbs/.xian template engine was removed along with the scaffold's landing
// page. This process serves a JSON API and nothing else — the user interface is
// the React app, which Vite serves separately. Keeping a server-side view engine
// around for one boilerplate page meant maintaining a second rendering stack
// that no part of the product used.

// Every controller in this codebase is an `async` function with no try/catch.
// Wrapping the whole tree once here routes their rejections to `errorHandler`
// below instead of letting them kill the process. See middleware/asyncHandler.js.
wrapRouterStack(router);
app.use("/", router);

// Must be last: Express selects the error handler by position.
app.use(errorHandler);

// ── Integrity monitoring ─────────────────────────────────────────────────────
// Hooks must be attached before the first request, because a write that happens
// without them leaves no fingerprint and will later look like an unauthorised
// insert. Failure to attach is logged loudly rather than swallowed: the system
// still works, but it is no longer watching, and that must not be silent.
import { attachIntegrityHooks } from "./services/integrityMonitor.js";
import { runSecurityScan } from "./controllers/securityController.js";

await attachIntegrityHooks().catch((err) =>
  console.error("[integrity] hooks NOT attached — out-of-band changes will go undetected:", err.message)
);

// A sweep on a timer, because the whole point is catching a change nobody
// reported. Waiting for an administrator to remember to press a button would
// mean tampering sits undetected for as long as nobody thinks to look.
const SCAN_MINUTES = Number(process.env.SECURITY_SCAN_MINUTES ?? 30);
if (!process.env.ELECTRON && process.env.CLOUDFLARE_WORKER !== "true" && SCAN_MINUTES > 0) {
  const scan = () =>
    runSecurityScan(null, null)
      .then((result) => {
        if (result.findings > 0) {
          console.warn(`[security] scan found ${result.findings} issue(s), ${result.newAlerts} new`);
        }
      })
      .catch((err) => console.error("[security] scheduled scan failed:", err.message));

  // First pass shortly after boot rather than immediately, so the connection
  // pool and model registry are settled before it walks every watched table.
  setTimeout(scan, 60_000).unref?.();
  setInterval(scan, SCAN_MINUTES * 60_000).unref?.();
}

if (process.env.CLOUDFLARE_WORKER !== "true") startAuthExpirationSweep();

export default app;

if (!process.env.ELECTRON && process.env.CLOUDFLARE_WORKER !== "true") {
  app.listen(PORT, () => console.log(`🔥 XianFire running at http://localhost:${PORT}`));
}
