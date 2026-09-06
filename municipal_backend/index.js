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
import router from "./routes/index.js";
import { wrapRouterStack, errorHandler } from "./middleware/asyncHandler.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
// Configure only the proxy addresses/hops actually used by this deployment.
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : process.env.TRUST_PROXY);

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

// Production refuses to start without a private session signing key.
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-insecure-secret";
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET is required in production.");
}

app.use(session({
  secret: SESSION_SECRET,
  store: new DatabaseSessionStore(),
  rolling: false,
  resave: false,
  saveUninitialized: false,
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
if (!process.env.ELECTRON && SCAN_MINUTES > 0) {
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

startAuthExpirationSweep();

export default app;

if (!process.env.ELECTRON) {
  app.listen(PORT, () => console.log(`🔥 XianFire running at http://localhost:${PORT}`));
}
