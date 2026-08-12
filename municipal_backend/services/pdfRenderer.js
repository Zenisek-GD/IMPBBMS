import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

// ── HTML → PDF ───────────────────────────────────────────────────────────────
// Templates are authored as HTML because that is the only format in which an
// official can realistically control layout, fonts, tables, logos and signature
// blocks. Rendering that faithfully needs a real browser engine, so this drives
// the Chrome already installed on the machine rather than bundling a second
// copy of Chromium (~170MB) inside the repository.
//
// The trade-off, recorded here because it is a deployment requirement and not
// an implementation detail: **the server must have Chrome, Chromium or Edge
// installed.** Set CHROME_PATH in .env to point at it explicitly; otherwise the
// usual install locations below are searched.

const ENV_KEYS = ["CHROME_PATH", "PUPPETEER_EXECUTABLE_PATH"];

// Ordered by preference: real Chrome first, then Chromium, then Edge, which is
// Chromium underneath and present on every modern Windows install — a useful
// fallback for an LGU machine where Chrome may not be standard.
const CANDIDATES = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
  ],
};

let cachedExecutable = null;

export const resolveBrowserExecutable = () => {
  if (cachedExecutable) return cachedExecutable;

  for (const key of ENV_KEYS) {
    const configured = process.env[key];
    if (configured && fs.existsSync(configured)) {
      cachedExecutable = configured;
      return cachedExecutable;
    }
  }

  for (const candidate of CANDIDATES[process.platform] ?? []) {
    if (fs.existsSync(candidate)) {
      cachedExecutable = candidate;
      return cachedExecutable;
    }
  }

  return null;
};

export class BrowserUnavailableError extends Error {
  constructor() {
    super(
      "No Chrome, Chromium or Edge installation was found, so PDFs cannot be rendered. " +
        "Install one, or set CHROME_PATH in the backend .env to its executable."
    );
    this.name = "BrowserUnavailableError";
    this.code = "BROWSER_UNAVAILABLE";
  }
}

// One browser for the process, launched on first use and reused. Launching
// Chrome costs roughly a second; doing that per document would make generating
// a batch of certificates painful for no benefit. Each render still gets its
// own page, so documents cannot see each other's state.
let browserPromise = null;

const getBrowser = async () => {
  const executablePath = resolveBrowserExecutable();
  if (!executablePath) throw new BrowserUnavailableError();

  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        executablePath,
        headless: true,
        // `--no-sandbox` is required to run as root in a container, which is
        // where this will sit if it is ever deployed. It is acceptable *only*
        // because the page is fed sanitised HTML and denied network access
        // below — never point this renderer at arbitrary remote URLs.
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }

  return browserPromise;
};

export const closeBrowser = async () => {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => {});
};

// Shut the browser down with the process rather than leaving an orphaned
// Chrome behind every time nodemon restarts.
for (const signal of ["SIGINT", "SIGTERM", "beforeExit"]) {
  process.once(signal, () => {
    closeBrowser();
  });
}

const MARGIN_DEFAULT = { top: "25mm", right: "20mm", bottom: "25mm", left: "20mm" };

export const renderPdf = async (
  html,
  { pageSize = "A4", landscape = false, margins, headerHtml, footerHtml } = {}
) => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // ── No network, ever ─────────────────────────────────────────────────────
    // A template is authored by a user, and an <img src="http://..."> inside one
    // would make the server fetch a URL of the author's choosing — a
    // server-side request forgery that could reach hosts only the server can
    // see. Everything a document needs must therefore be inline: images as
    // data: URIs, CSS in the document. Anything else is refused here rather
    // than trusted to the sanitiser alone, so the two controls back each other.
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (url.startsWith("data:") || url === "about:blank") return request.continue();
      request.abort();
    });

    await page.setContent(html, { waitUntil: "load", timeout: 15000 });

    const pdf = await page.pdf({
      format: pageSize,
      landscape,
      printBackground: true,
      margin: { ...MARGIN_DEFAULT, ...(margins ?? {}) },
      // Puppeteer only draws header and footer templates when this is on, and
      // it silently ignores them otherwise — a confusing failure worth avoiding.
      displayHeaderFooter: Boolean(headerHtml || footerHtml),
      headerTemplate: headerHtml ?? "<span></span>",
      footerTemplate: footerHtml ?? "<span></span>",
    });

    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
};
