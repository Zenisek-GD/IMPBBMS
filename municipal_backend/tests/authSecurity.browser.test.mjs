import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import puppeteer from "puppeteer-core";

test("security settings and fixed session expiry in a real browser", { timeout: 90_000 }, async (t) => {
  const executablePath = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  assert.ok(executablePath, "Set CHROME_PATH to an installed Chrome/Edge executable.");
  const app = express();
  const dist = path.resolve("../municipal-frontend/dist");
  assert.ok(fs.existsSync(path.join(dist, "index.html")), "Build the frontend first.");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const browser = await puppeteer.launch({ executablePath, headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const origin = "http://127.0.0.1:" + server.address().port;
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let enabled = true;
  let authenticated = true;
  let forceExpired = false;
  let deadline = Date.now() + 120_000;
  let policyWrites = 0;
  const policy = () => ({ twoFactorEnabled: enabled, require2faOnNewDevice: enabled,
    trusted2faDurationMinutes: 30, sessionDurationMinutes: 30, automaticSessionLogout: true });
  const user = () => ({
    id: 1, name: "Browser Test Admin", email: "admin@example.test", role: "systemAdministrator",
    roleName: "System Administrator", permissions: [], themePreference: "light",
    sessionTimeoutMs: 1_800_000, loginSessionExpiresAt: deadline,
    twoFactorTrustedUntil: deadline, serverTime: Date.now(), mfaVerified: true, mfaEnrollmentRequired: false,
  });
  await page.setRequestInterception(true);
  page.on("request", async (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return request.continue();
    const headers = {
      "access-control-allow-origin": origin, "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
      "access-control-allow-headers": "content-type", "cache-control": "no-store",
    };
    if (request.method() === "OPTIONS") return request.respond({ status: 204, headers });
    let status = 200;
    let data = {};
    if (url.pathname === "/api/auth/me") {
      if (forceExpired || Date.now() >= deadline) {
        status = 401;
        data = { code: "SESSION_EXPIRED", message: "Your session has expired after 30 minutes. Please log in again." };
      } else if (!authenticated) { status = 401; data = { message: "Not authenticated." }; }
      else data = user();
    } else if (url.pathname === "/api/security/authentication") {
      if (request.method() === "PATCH") {
        const body = JSON.parse(request.postData());
        assert.equal(body.confirmDisable, !body.twoFactorEnabled);
        enabled = body.twoFactorEnabled;
        policyWrites++;
      }
      data = policy();
    } else if (url.pathname === "/api/settings") {
      data = { lgu: { name: "Test Municipality" }, branding: { systemName: "ProcureNance" } };
    } else if (url.pathname.includes("notifications")) {
      data = [];
    }
    await request.respond({ status, contentType: "application/json", headers, body: JSON.stringify(data) });
  });

  await page.goto(origin + "/admin/security-settings", { waitUntil: "networkidle0" });
  await page.waitForSelector('[role="switch"]');
  assert.equal(await page.$eval('[role="switch"]', (element) => element.getAttribute("aria-checked")), "true");
  assert.match(await page.evaluate(() => document.body.innerText), /Automatic Session Logout/);
  await page.click('[role="switch"]');
  await page.waitForSelector('[role="dialog"]');
  assert.equal(policyWrites, 0);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === "Cancel").click());
  assert.equal(policyWrites, 0);
  await page.click('[role="switch"]');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === "Disable 2FA").click());
  await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "false");
  assert.equal(policyWrites, 1);
  await page.click('[role="switch"]');
  await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === "true");

  forceExpired = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => location.pathname === "/login");
  try {
    await page.waitForFunction(() => document.body.innerText.includes("Your session has expired after 30 minutes"), { timeout: 5000 });
  } catch (error) {
    t.diagnostic(JSON.stringify({ errors, page: await page.evaluate(() => ({ url: location.href, visibility: document.documentElement.style.visibility, html: document.body.innerHTML.slice(0, 2500) })) }));
    throw error;
  }

  // A short fixture deadline proves the UI uses the supplied fixed deadline,
  // rather than inactivity or a hardcoded 30-minute client timer.
  forceExpired = false;
  authenticated = true;
  deadline = Date.now() + 5000;
  await page.goto(origin + "/admin/security-settings", { waitUntil: "networkidle0" });
  await page.waitForSelector('[role="switch"]');
  await page.evaluate(() => {
    window.activityTimer = setInterval(() => {
      window.dispatchEvent(new MouseEvent("mousemove"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    }, 50);
  });
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 10_000 });
  assert.match(await page.evaluate(() => document.body.innerText), /Your session has expired after 30 minutes/);
  await page.evaluate(() => { clearInterval(window.activityTimer); history.back(); });
  await page.waitForFunction(() => location.pathname === "/login");
  assert.equal(await page.$('[role="switch"]'), null);
  assert.deepEqual(errors, []);
});
