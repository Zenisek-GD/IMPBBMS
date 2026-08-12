import { sanitizeHtml } from "./htmlSanitizer.js";
import { HTML_TOKENS, PLACEHOLDER_INDEX } from "./documentTypes.js";
import { escapeHtml } from "./placeholderResolver.js";

// ── SUBSTITUTION AND PAGE ASSEMBLY ───────────────────────────────────────────
// Two jobs: replace `{token}` with the resolved value, and wrap the result in a
// printable page with the template's own styling.

// Deliberately strict: letters, digits and underscores only. A loose pattern
// would treat any brace in the body — `{` in a quoted specification, say — as a
// placeholder and eat it.
const TOKEN_PATTERN = /\{([a-z0-9_]+)\}/gi;

// Values are escaped by default. A supplier called `Smith & Sons <Ltd>` must
// appear as written and must not be able to inject markup into a document that
// will be published. The few tokens that are *meant* to be markup — the line
// items table the resolver builds — are listed in HTML_TOKENS and pass through.
const substituteInto = (html, context, { onMissing } = {}) =>
  String(html ?? "").replace(TOKEN_PATTERN, (match, rawToken) => {
    const token = rawToken.toLowerCase();

    if (!(token in context)) {
      onMissing?.(token);
      // An unresolved token is left visibly as-is rather than blanked. A blank
      // looks like an intentionally empty field and ships; `{supplier_name}`
      // printed on the page is obviously wrong and gets caught in preview.
      return match;
    }

    const value = context[token];
    if (value === null || value === undefined || value === "") return "";

    return HTML_TOKENS.has(token) ? String(value) : escapeHtml(value);
  });

// Which tokens a template references, for the editor to warn about before
// anyone generates from it.
export const tokensUsedIn = (...fragments) => {
  const tokens = new Set();
  for (const fragment of fragments) {
    for (const match of String(fragment ?? "").matchAll(TOKEN_PATTERN)) {
      tokens.add(match[1].toLowerCase());
    }
  }
  return [...tokens];
};

// Tokens the template uses that this document type can never resolve. Reported
// at save time so an officer finds out while writing, not after printing forty
// certificates with `{contract_no}` on them.
export const unresolvableTokens = (tokens, documentType) =>
  tokens.filter((token) => {
    const definition = PLACEHOLDER_INDEX[token];
    if (!definition) return true; // not a token the system knows at all
    return !definition.sources.includes(documentType);
  });

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    /* Explicit white. With printBackground on, a transparent body inherits
       whatever is behind it — fine on paper, wrong everywhere the same HTML is
       previewed, including a dark-themed browser. (No backticks in here: this
       block lives inside a template literal.) */
    background: #ffffff;
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #000;
  }
  h1, h2, h3, h4 { margin: 0 0 8pt; line-height: 1.25; }
  p { margin: 0 0 8pt; }
  table { border-collapse: collapse; width: 100%; }
  /* Tables in official documents are ruled. An unruled table reads as a
     layout accident rather than a schedule of items. */
  table.doc-table th, table.doc-table td {
    border: 1px solid #000;
    padding: 4pt 6pt;
    font-size: 10.5pt;
  }
  table.doc-table th { background: #eee; text-align: center; }
  /* A signature block split across a page break is the single most common
     complaint about generated documents. */
  .signature-block, .sig, tr { page-break-inside: avoid; }
  img { max-width: 100%; }
`;

// Assembles the printable page. The template's CSS is placed after the base so
// an author can override anything, and it is *not* sanitised as markup — it is
// injected into a <style> element, so it is filtered separately below.
const CSS_BANNED = /(?:@import|expression\s*\(|url\s*\(\s*['"]?(?!data:)|javascript:|<\/style)/i;

const safeCss = (css) => {
  if (!css) return "";
  // A stylesheet cannot be parsed with the tag sanitiser, so it gets its own
  // narrow rule: nothing that loads a resource, and nothing that can close the
  // <style> element and escape into markup.
  return CSS_BANNED.test(css) ? "" : css;
};

export const assembleDocument = ({ bodyHtml, css, title }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title ?? "Document")}</title>
<style>${BASE_CSS}${safeCss(css)}</style>
</head><body>${bodyHtml}</body></html>`;

// ── The one function callers use ─────────────────────────────────────────────
// Returns the full printable HTML plus the running header/footer fragments and
// a list of tokens that did not resolve, so the caller can warn.
export const renderTemplate = ({ version, context, title }) => {
  const missing = new Set();
  const onMissing = (token) => missing.add(token);

  // Sanitise *after* substitution, not before. Substituting into already-clean
  // markup would let a resolved value that happened to contain markup slip in
  // unchecked; doing it this way means everything the reader sees has been
  // through the filter, whatever its origin.
  const bodyHtml = sanitizeHtml(substituteInto(version.bodyHtml, context, { onMissing }));
  const headerHtml = version.headerHtml
    ? sanitizeHtml(substituteInto(version.headerHtml, context, { onMissing }))
    : null;
  const footerHtml = version.footerHtml
    ? sanitizeHtml(substituteInto(version.footerHtml, context, { onMissing }))
    : null;

  return {
    bodyHtml,
    headerHtml,
    footerHtml,
    html: assembleDocument({ bodyHtml, css: version.css, title }),
    missingTokens: [...missing],
  };
};

// Re-render a document whose body an officer has edited by hand. The edit is
// already substituted markup, so it only needs sanitising and wrapping.
export const assembleFromEditedBody = ({ bodyHtml, version, title }) => {
  const clean = sanitizeHtml(bodyHtml);
  return { bodyHtml: clean, html: assembleDocument({ bodyHtml: clean, css: version?.css, title }) };
};
