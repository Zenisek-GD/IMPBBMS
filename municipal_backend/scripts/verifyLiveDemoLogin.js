// Verifies the deployed demo sign-in response without printing a password.
// The seed password is read locally and only sent to the configured Worker over
// HTTPS. This is a deployment check, not a general-purpose login utility.
import { readFile } from "node:fs/promises";

const seed = await readFile(new URL("../seed.js", import.meta.url), "utf8");
const password = seed.match(/SEED_PASSWORD\s*=\s*"([^"]+)"/)?.[1];
if (!password) throw new Error("Could not read the local demo password from seed.js.");

const email = process.env.DEMO_LOGIN_EMAIL ?? "systemadministrator@procurenance.com";
const origin = process.env.DEMO_WORKER_ORIGIN ?? "https://procurenance.roxas.workers.dev";
const response = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers: {
    Origin: origin,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password }),
});
const raw = await response.text();
const body = raw ? JSON.parse(raw) : {};

console.log(
  JSON.stringify({
    status: response.status,
    name: body.name ?? null,
    role: body.role ?? null,
    roleName: body.roleName ?? null,
    mfaRequired: Boolean(body.mfaRequired),
    mfaEnrollmentRequired: Boolean(body.mfaEnrollmentRequired),
    message: body.message ?? null,
  })
);
