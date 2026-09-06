// Cloudflare Worker entry point.
//
// The application itself remains an Express app. Cloudflare's Node HTTP
// adapter turns it into a Worker handler, while Hyperdrive gives mysql2 and
// Sequelize a secure MySQL connection without exposing database credentials to
// the browser.
import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import publicDemoSnapshot from "./public-demo-snapshot.json";
import { publicProjectView, assertPublicSnapshot } from "./services/publicSnapshotSafety.js";

assertPublicSnapshot(publicDemoSnapshot);

// The anonymous portal must remain useful during a live demonstration even if
// the external MySQL service is temporarily unreachable. This file is
// generated from the local published records with
// `node --env-file=.env scripts/generatePublicDemoSnapshot.js`; it includes no
// credentials, drafts, sessions, contact details, or internal fields.
const demoBranding = {
  systemName: "ProcureNance",
  transparencyTitle: "Transparency Portal",
  transparencyFooter:
    "Published under the Implementing Rules and Regulations of RA No. 12009 (New Government Procurement Act). These pages show approved and published records only.",
};

const snapshotJson = (value, init = {}) =>
  Response.json(value, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Strict-Transport-Security": "max-age=31536000",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox",
      ...init.headers,
    },
  });

const snapshotProjects = (url) => {
  const category = url.searchParams.get("category");
  const fiscalYear = url.searchParams.get("fiscalYear");
  const department = url.searchParams.get("department");
  const search = url.searchParams.get("search")?.trim().toLowerCase();

  return publicDemoSnapshot.projects.filter((project) => {
    if (category && category !== "all" && project.category !== category) return false;
    if (fiscalYear && String(project.fiscalYear) !== fiscalYear) return false;
    if (department && String(project.implementingUnitId) !== department) return false;
    if (!search) return true;
    return [project.referenceNo, project.projectTitle, project.description, project.implementingUnit]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
};

const publicSnapshotResponse = (request) => {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/public/branding") return snapshotJson(demoBranding);
  if (pathname === "/api/public/projects/overview") return snapshotJson(publicDemoSnapshot.overview);
  if (pathname === "/api/public/projects/filters") return snapshotJson(publicDemoSnapshot.filters);
  if (pathname === "/api/public/projects") return snapshotJson(snapshotProjects(url));

  const detail = pathname.match(/^\/api\/public\/projects\/(\d+)$/);
  if (detail) {
    const project = publicDemoSnapshot.detailedProjects.find((item) => item.id === Number(detail[1]));
    return project
      ? snapshotJson(publicProjectView(project))
      : snapshotJson({ message: "That project is not published, or does not exist." }, { status: 404 });
  }

  return null;
};

// The Express-to-Workers Node adapter can occasionally omit the final closing
// delimiter from an otherwise complete JSON response. Axios then accepts the
// malformed text as a string, leaving the UI without `name` or `role` after a
// valid sign-in. Repair only the precise one-character truncation we can prove
// is valid JSON; do not mask other malformed server responses, and never touch
// downloads or other non-JSON bodies.
const repairTruncatedJsonResponse = async (response) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const raw = await response.text();
  if (!raw) return new Response(raw, { status: response.status, statusText: response.statusText, headers: response.headers });

  try {
    JSON.parse(raw);
    return new Response(raw, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch {
    for (const delimiter of ["}", "]"]) {
      try {
        JSON.parse(raw + delimiter);
        console.warn("[worker] repaired a one-character truncated JSON response");
        return new Response(raw + delimiter, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch {
        // Try the other closing delimiter. The original malformed result is
        // returned below if neither produces valid JSON.
      }
    }
    return new Response(raw, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
};

// index.js and models/db.js intentionally remain usable with normal Node.js.
// Set the configuration before dynamically importing them, because Sequelize
// captures its connection settings when models/db.js is evaluated.
const configureDatabaseConnection = () => {
  if (!env.HYPERDRIVE) {
    throw new Error(
      "The HYPERDRIVE binding is missing. Create it as described in CLOUDFLARE_DEPLOYMENT.md."
    );
  }
  process.env.CLOUDFLARE_WORKER = "true";
  process.env.DB_HOST = env.HYPERDRIVE.host;
  process.env.DB_PORT = String(env.HYPERDRIVE.port);
  process.env.DB_USER = env.HYPERDRIVE.user;
  process.env.DB_PASSWORD = env.HYPERDRIVE.password;
  process.env.DB_NAME = env.HYPERDRIVE.database;
};

// Cloudflare prohibits asynchronous I/O while a module is evaluated. Initialize
// the Node/Express adapter lazily from a handler instead, then reuse it for the
// life of the Worker isolate.
let expressHandlerPromise;
const importExpressApp = async () => {
  // iconv-lite's optional Node stream extension is mapped to an empty browser
  // module by the Workers bundler. Express only needs iconv-lite's decoder, so
  // suppress the optional extension during this one module initialization.
  const nodeVersion = Object.getOwnPropertyDescriptor(process.versions, "node");
  if (nodeVersion?.configurable) {
    Object.defineProperty(process.versions, "node", { ...nodeVersion, value: undefined });
  }
  try {
    return await import("./index.js");
  } finally {
    if (nodeVersion?.configurable) Object.defineProperty(process.versions, "node", nodeVersion);
  }
};
const getExpressHandler = () => {
  if (!expressHandlerPromise) {
    expressHandlerPromise = (async () => {
      configureDatabaseConnection();
      const { default: app } = await importExpressApp();
      // Port 3000 is only an in-Worker routing key; it does not open a public
      // TCP listener. httpServerHandler connects it to the Worker fetch event.
      app.listen(3000);
      return { handler: httpServerHandler({ port: 3000 }) };
    })().catch((error) => {
      expressHandlerPromise = undefined;
      throw error;
    });
  }
  return expressHandlerPromise;
};

export default {
  async fetch(request, workerEnv, ctx) {
    const publicResponse = publicSnapshotResponse(request);
    if (publicResponse) return publicResponse;

    // Remove client-supplied proxy chains. Only Cloudflare's ingress address is
    // trusted, so changing X-Forwarded-For cannot evade limits or forge audits.
    const headers = new Headers(request.headers);
    headers.delete("forwarded");
    headers.set("x-forwarded-for", request.headers.get("cf-connecting-ip") || "unknown");
    headers.set("x-forwarded-proto", "https");
    headers.set("x-forwarded-host", new URL(request.url).host);
    const { handler } = await getExpressHandler();
    const response = await handler.fetch(new Request(request, { headers }), workerEnv, ctx);
    return repairTruncatedJsonResponse(response);
  },

  // Replaces the process-local setInterval used by ordinary Node deployment.
  // Cron runs in UTC; the trigger is deliberately every 30 minutes to preserve
  // SECURITY_SCAN_MINUTES' production default.
  async scheduled(_controller, _workerEnv, ctx) {
    configureDatabaseConnection();
    const { runSecurityScan } = await import("./controllers/securityController.js");
    ctx.waitUntil(
      Promise.all([
        runSecurityScan(null, null),
        // Prevent expired cookie sessions accumulating indefinitely in D1.
        env.SESSIONS.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run(),
        env.SESSIONS.prepare("DELETE FROM rate_limits WHERE expires_at <= ?").bind(Date.now()).run(),
      ]).catch((error) =>
        console.error("[security] scheduled work failed:", error?.name ?? "Error")
      )
    );
  },
};
