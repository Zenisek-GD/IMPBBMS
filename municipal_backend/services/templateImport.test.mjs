import assert from "node:assert/strict";
import test from "node:test";
import { importHtmlTemplate } from "./templateImport.js";

test("HTML template import keeps safe document layout while removing executable markup", () => {
  const imported = importHtmlTemplate({
    originalname: "Award Notice.html",
    buffer: Buffer.from(`<!doctype html>
      <html><head><style>p { margin-bottom: 8pt; } @import url(https://bad.example/style.css);</style></head>
      <body><h1 style="text-align:center">Notice of Award</h1><p>{supplier_name}</p>
      <script>alert('no')</script><img src="https://bad.example/logo.png" onerror="alert(1)"></body></html>`),
  });

  assert.equal(imported.error, undefined);
  assert.match(imported.bodyHtml, /Notice of Award/);
  assert.match(imported.bodyHtml, /\{supplier_name\}/);
  assert.doesNotMatch(imported.bodyHtml, /script|onerror|https:\/\//i);
  assert.equal(imported.css, "");
  assert.equal(imported.sourceFilename, "Award Notice.html");
  assert.match(imported.sourceChecksum, /^[a-f0-9]{64}$/);
});

test("HTML template import retains a safe stylesheet and extracts the document body", () => {
  const imported = importHtmlTemplate({
    originalname: "layout.htm",
    buffer: Buffer.from("<html><head><style>table { width: 100%; border-collapse: collapse; }</style></head><body><table><tr><td>Body only</td></tr></table></body></html>"),
  });

  assert.match(imported.bodyHtml, /Body only/);
  assert.doesNotMatch(imported.bodyHtml, /<style/i);
  assert.equal(imported.css, "table { width: 100%; border-collapse: collapse; }");
});

test("HTML template import rejects empty and non-text payloads", () => {
  assert.equal(importHtmlTemplate({ buffer: Buffer.alloc(0) }).error, "The template file is empty.");
  assert.equal(importHtmlTemplate({ buffer: Buffer.from("<p>hello</p>\0") }).error, "The template file is not valid UTF-8 HTML.");
});
