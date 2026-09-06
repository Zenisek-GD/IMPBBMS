// Optional real-Chromium check. Does not load application data or use .env.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { sanitizeHtml } from "../services/htmlSanitizer.js";
import { renderPdf, closeBrowser, resolveBrowserExecutable } from "../services/pdfRenderer.js";

const executablePath = resolveBrowserExecutable();
if (!executablePath) throw new Error("Install Chromium/Chrome/Edge to run this test.");
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  const requests = [];
  await page.setRequestInterception(true);
  page.on("request", request => { requests.push(request.url()); request.abort(); });
  const dirty = `<img src='data:image/png;base64,AAAA" onerror="window.exploited=1'>` +
    `<p style='color:red" onmouseover="window.exploited=1'>Hover me</p>` +
    `<p style="background:&#117;rl(https://attacker.invalid/image)">Text</p>`;
  await page.setContent(sanitizeHtml(dirty));
  await page.hover("p");
  assert.equal(await page.evaluate(() => Boolean(window.exploited)), false);
  assert.deepEqual(requests, []);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("*")].some(el => [...el.attributes].some(a => a.name.startsWith("on")))), false);
  console.log("PASS: real Chromium blocks the sanitized attribute/CSS payloads.");
  const pdf = await renderPdf('<html><body><h1>Security renderer test</h1><script>while(true){}</script><img src="https://attacker.invalid/image"></body></html>');
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  console.log("PASS: sandboxed PDF rendering completes with hostile JavaScript disabled and outbound requests blocked.");
} finally {
  await browser.close();
  await closeBrowser();
}
