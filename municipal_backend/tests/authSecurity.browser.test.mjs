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
  const roles = [
    { id: 1, key: "systemAdministrator", name: "System Administrator", twoFactorRequired: true, twoFactorVersion: 0 },
    { id: 2, key: "observer", name: "Observer", twoFactorRequired: false, twoFactorVersion: 0 },
    { id: 3, key: "customRole", name: "Custom Database Role", twoFactorRequired: true, twoFactorVersion: 0 },
  ];
  let currentRole = "systemAdministrator";
  let currentPermissions = [];
  let lastUpdate;
  let authenticated = true;
  let forceExpired = false;
  let deadline = Date.now() + 120_000;
  let policyWrites = 0;
  const policy = () => ({ roles, requiredRoleCount: roles.filter((role) => role.twoFactorRequired).length,
    trusted2faDurationMinutes: 30, sessionDurationMinutes: 30, automaticSessionLogout: true });
  const user = () => ({
    id: 1, name: "Browser Test Admin", email: "admin@example.test", role: currentRole,
    roleName: currentRole, permissions: currentPermissions, themePreference: "light",
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
        assert.ok(Array.isArray(body.roles));
        assert.equal(body.confirmDisable, body.roles.some((update) => !update.twoFactorRequired));
        lastUpdate = body;
        for (const update of body.roles) {
          const role = roles.find((role) => role.id === update.id);
          assert.equal(update.expectedVersion, role.twoFactorVersion);
          role.twoFactorRequired = update.twoFactorRequired;
          role.twoFactorVersion++;
        }
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


  const click = (label) => page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((button) => button.textContent === label);
    if (!button) throw new Error("Missing button: " + label);
    button.click();
  }, label);
  const waitSaved = (count) => page.waitForFunction((count) =>
    document.body.innerText.includes(count + ' of 3 roles currently require'), {}, count);
  const adminSwitch = '[role="switch"][aria-label="Require 2FA for System Administrator"]';
  const observerSwitch = '[role="switch"][aria-label="Require 2FA for Observer"]';
  const customSwitch = '[role="switch"][aria-label="Require 2FA for Custom Database Role"]';
  await page.goto(origin + "/admin/security-settings", { waitUntil: "networkidle0" });
  await page.waitForSelector(adminSwitch);
  assert.equal((await page.$$('[role="switch"]')).length, 3);
  assert.match(await page.evaluate(() => document.body.innerText), /2 of 3 roles currently require/);
  assert.match(await page.evaluate(() => document.body.innerText), /Automatic Session Logout/);
  await click("Select All");
  assert.equal(await page.$$eval('input[type="checkbox"]', (items) => items.filter((item) => item.checked).length), 3);
  await click("Clear Selection");
  assert.equal(await page.$$eval('input[type="checkbox"]', (items) => items.filter((item) => item.checked).length), 0);
  assert.equal(policyWrites, 0);
  await page.click('input[aria-label="Select Observer"]');
  await click("Enable 2FA for Selected Roles");
  assert.equal(policyWrites, 0);
  assert.equal(roles[1].twoFactorRequired, false);
  await click("Save Security Settings");
  await page.waitForSelector('[role="dialog"]');
  await click("Cancel");
  assert.equal(policyWrites, 0);
  await click("Save Security Settings");
  await click("Apply on Next Login");
  await waitSaved(3);
  assert.equal(policyWrites, 1);
  assert.equal(lastUpdate.roles.length, 1);
  assert.equal(lastUpdate.roles[0].id, 2);

  await page.click(adminSwitch);
  assert.equal(policyWrites, 1);
  assert.equal(roles[0].twoFactorRequired, true);
  await click("Save Security Settings");
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.$eval('[role="dialog"]', (element) => element.innerText), /System Administrator/);
  await click("Cancel");
  assert.equal(policyWrites, 1);
  await click("Save Security Settings");
  await click("Disable 2FA");
  await waitSaved(2);
  assert.equal(policyWrites, 2);

  // A mixed save confirms disabling first, then chooses how enabling applies.
  await page.click(adminSwitch);
  await page.click(observerSwitch);
  await page.click(customSwitch);
  await click("Save Security Settings");
  await page.waitForSelector('[role="dialog"]');
  const dialogText = await page.$eval('[role="dialog"]', (element) => element.innerText);
  assert.match(dialogText, /Observer/);
  assert.match(dialogText, /Custom Database Role/);
  await click("Confirm");
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.innerText.includes('Apply Security Change'));
  assert.equal(policyWrites, 2);
  await click("Force Re-Authentication Now");
  await waitSaved(1);
  assert.equal(policyWrites, 3);
  assert.equal(lastUpdate.applyMode, "forceReauthentication");
  assert.equal(lastUpdate.roles.length, 3);
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewport({ width: 1280, height: 900 });

  // A delegated database permission also exposes the route and sidebar link.
  currentRole = "observer";
  currentPermissions = ["manage_two_factor_authentication"];
  await page.goto(origin + "/admin/security-settings", { waitUntil: "networkidle0" });
  await page.waitForSelector(adminSwitch);
  assert.ok(await page.$('a[href="/admin/security-settings"]'));
  currentRole = "systemAdministrator";
  currentPermissions = [];

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
