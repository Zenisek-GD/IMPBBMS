// Calls the deployed MFA-enrolment endpoint as a demo account and reports only
// whether a QR payload was returned. It reads the seeded password locally and
// never prints credentials, cookies, OTP secrets, or QR data.
import { readFile } from "node:fs/promises";

const seed = await readFile(new URL("../seed.js", import.meta.url), "utf8");
const password = seed.match(/SEED_PASSWORD\s*=\s*"([^"]+)"/)?.[1];
if (!password) throw new Error("Could not read the local demo password from seed.js.");

const email = process.env.DEMO_LOGIN_EMAIL ?? "systemadministrator@procurenance.com";
const origin = process.env.DEMO_WORKER_ORIGIN ?? "https://procurenance.roxas.workers.dev";
const headers = {
  Origin: origin,
  "X-Requested-With": "XMLHttpRequest",
  "Content-Type": "application/json",
};

const login = await fetch(`${origin}/api/auth/login`, {
  method: "POST",
  headers,
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`Login check failed with HTTP ${login.status}.`);
const loginBody = await login.json().catch(() => { throw new Error('Login returned invalid JSON.'); });

const cookies = typeof login.headers.getSetCookie === "function"
  ? login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ")
  : login.headers.get("set-cookie")?.split(";", 1)[0];
if (!cookies) throw new Error("The deployed login did not return a session cookie.");

try {
if (!loginBody.mfaEnrollmentRequired) {
  console.log(JSON.stringify({ skipped: true, reason: 'Account is already enrolled or needs an authenticator challenge.' }));
} else {
const enrollment = await fetch(`${origin}/api/auth/mfa/enroll`, {
  method: "POST",
  headers: { ...headers, Cookie: cookies },
});
const body = await enrollment.json().catch(() => ({}));

console.log(JSON.stringify({
  status: enrollment.status,
  qrGenerated: typeof body.qrDataUri === "string" && body.qrDataUri.startsWith("data:image/"),
  responseValid: Boolean(body.qrDataUri && body.parameters),
}));
process.exitCode = enrollment.ok && typeof body.qrDataUri === 'string' ? 0 : 1;
}
} finally {
  const logout = await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { ...headers, Cookie: cookies } });
  console.log(JSON.stringify({ testSessionLoggedOut: logout.ok }));
}
