// ── ALLOW-LIST SANITISER FOR TEMPLATE AND DOCUMENT HTML ──────────────────────
// Template bodies are authored by officials in a rich-text editor and are
// stored as HTML. That HTML then goes three places, and each one is a reason
// this exists:
//
//   · into a headless browser to be printed — a <script> there runs on the
//     server, with whatever the page can reach
//   · into the operator's browser for preview and editing
//   · onto the **public transparency portal**, where an approved Notice of
//     Award is read by anyone
//
// So a template author is, without the sanitiser, someone who can run script in
// every reader's browser. The editor already restricts what it *produces*; this
// restricts what is *accepted*, because the API takes HTML from the client and
// the client is not the boundary.
//
// Written as an allow-list rather than a block-list on purpose: a block-list
// has to anticipate every dangerous construct, and it never does.

const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "div", "span", "section", "article",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "sub", "sup", "small", "mark",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "img", "figure", "figcaption",
]);

// Deliberately absent and worth naming: `script` and `style` (execution and
// global restyling), `iframe`, `object`, `embed`, `form`, `input`, `button`
// (interactive surfaces have no meaning in a printed document but plenty in a
// published page), and `a` — a link inside an official document is either dead
// on paper or a phishing vector on the portal.

const GLOBAL_ATTRS = new Set(["style", "class", "align", "dir", "lang", "title"]);

const TAG_ATTRS = {
  img: new Set(["src", "alt", "width", "height"]),
  td: new Set(["colspan", "rowspan", "valign"]),
  th: new Set(["colspan", "rowspan", "valign", "scope"]),
  col: new Set(["span", "width"]),
  colgroup: new Set(["span"]),
  table: new Set(["border", "cellpadding", "cellspacing", "width"]),
};

// CSS properties an author can reasonably need for a document layout. Anything
// else — notably `position`, `behavior` and anything that can load a URL — is
// dropped rather than trusted.
const ALLOWED_CSS = new Set([
  "color", "background-color", "background",
  "font-size", "font-family", "font-weight", "font-style", "font-variant",
  "text-align", "text-decoration", "text-transform", "text-indent",
  "line-height", "letter-spacing", "word-spacing", "white-space",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-top", "border-right", "border-bottom", "border-left",
  "border-color", "border-width", "border-style", "border-collapse", "border-radius",
  "width", "height", "max-width", "min-width", "max-height", "min-height",
  "display", "vertical-align", "float", "clear",
  "page-break-before", "page-break-after", "page-break-inside", "break-inside",
  "list-style", "list-style-type", "list-style-position",
]);

// `url(...)` in a declaration can fetch a remote asset — the same server-side
// request forgery the PDF renderer blocks at the network layer. Blocked here
// too so the two controls are independent.
const CSS_VALUE_BANNED = /(?:url\s*\(|expression\s*\(|javascript:|@import|behaviou?r\s*:)/i;

const sanitiseStyle = (value) =>
  String(value)
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const [property, ...rest] = declaration.split(":");
      const propertyName = property.trim().toLowerCase();
      const propertyValue = rest.join(":").trim();
      if (!ALLOWED_CSS.has(propertyName)) return false;
      if (CSS_VALUE_BANNED.test(propertyValue)) return false;
      return propertyValue.length > 0;
    })
    .join("; ");

// Images may only be inline data. A remote src would make every reader of a
// published document call out to a third-party host, which leaks who is reading
// it — and would make the server do the same while printing.
//
// SVG is excluded even though it is an image format, matching the rule the
// attachment store already applies: an SVG is a document that can carry script.
// Browsers do not execute script in an SVG loaded through <img>, so this is
// belt-and-braces rather than a known hole — but the day that markup is moved
// into an <object> or inlined by some future feature, the hole opens silently.
// A municipal seal is a PNG.
const isSafeImageSrc = (value) => /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value.trim());

const escapeText = (text) =>
  text.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;").replace(/</g, "&lt;");

const VOID_TAGS = new Set(["br", "hr", "img", "col"]);

// A small hand-written parser rather than a dependency. The input is
// editor-produced markup, and the failure mode is deliberately conservative:
// anything not recognised is dropped, not passed through.
export const sanitizeHtml = (input) => {
  if (!input) return "";

  const source = String(input);
  const out = [];
  const openTags = [];

  // Strip comments outright — conditional comments are an execution vector in
  // some renderers and there is no reason a document body needs one.
  //
  // Then remove the elements whose *contents* are code rather than text, along
  // with those contents. Dropping only the tag would leave the script body
  // behind as escaped text: harmless to execute, but it would print the source
  // of the attempted injection in the middle of an official document.
  const cleaned = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    // ...and the same tags left unclosed, which would otherwise swallow nothing
    // and leak everything after them.
    .replace(/<(script|style|noscript|template|iframe|object|embed)\b[^>]*>/gi, "");

  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\/?>/g;
  let lastIndex = 0;
  let match;

  while ((match = tagPattern.exec(cleaned)) !== null) {
    out.push(escapeText(cleaned.slice(lastIndex, match.index)));
    lastIndex = tagPattern.lastIndex;

    const [raw, rawName, rawAttrs = ""] = match;
    const name = rawName.toLowerCase();
    const isClosing = raw.startsWith("</");

    if (!ALLOWED_TAGS.has(name)) continue; // drop the tag, keep going

    if (isClosing) {
      const index = openTags.lastIndexOf(name);
      if (index === -1) continue; // stray close tag
      // Close anything left open inside it, so dropped tags cannot unbalance
      // the output.
      while (openTags.length > index) out.push(`</${openTags.pop()}>`);
      continue;
    }

    const attributes = [];
    const attrPattern = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(rawAttrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? "";

      // Every `on*` handler, in one rule, rather than enumerating them.
      if (attrName.startsWith("on")) continue;
      if (!GLOBAL_ATTRS.has(attrName) && !TAG_ATTRS[name]?.has(attrName)) continue;

      if (attrName === "src") {
        if (!isSafeImageSrc(attrValue)) continue;
        attributes.push(`src="${attrValue.trim()}"`);
        continue;
      }

      if (attrName === "style") {
        const style = sanitiseStyle(attrValue);
        if (style) attributes.push(`style="${style}"`);
        continue;
      }

      attributes.push(`${attrName}="${escapeText(attrValue).replace(/"/g, "&quot;")}"`);
    }

    const rendered = `<${name}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;

    if (VOID_TAGS.has(name)) {
      out.push(rendered.replace(/>$/, " />"));
    } else {
      out.push(rendered);
      openTags.push(name);
    }
  }

  out.push(escapeText(cleaned.slice(lastIndex)));

  // Close anything the author left open, so a truncated template cannot swallow
  // the rest of the page it is rendered into.
  while (openTags.length) out.push(`</${openTags.pop()}>`);

  return out.join("");
};

// Header and footer fragments are printed by the browser's own header/footer
// machinery, which supports a much narrower subset and no stylesheet. They also
// carry Chrome's special classes (`pageNumber`, `totalPages`, `date`), so the
// class attribute has to survive.
export const sanitizeRunningFragment = (input) => sanitizeHtml(input);
