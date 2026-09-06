import sanitize from "sanitize-html";
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
const SAFE_CSS_VALUE = /^(?!.*(?:url\s*\(|expression\s*\(|javascript:|@|[\\<>])).+$/i;

// Parse HTML and decode entities before validating attributes. Attribute values
// are escaped by the serializer, including quotes in single-quoted input.
export const sanitizeHtml = (input) => sanitize(String(input ?? ""), {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: {
    "*": [...GLOBAL_ATTRS],
    ...Object.fromEntries(Object.entries(TAG_ATTRS).map(([tag, attrs]) => [tag, [...attrs]])),
  },
  allowedSchemes: ["data"],
  allowedSchemesAppliedToAttributes: ["src"],
  allowProtocolRelative: false,
  allowedStyles: { "*": Object.fromEntries([...ALLOWED_CSS].map((key) => [key, [SAFE_CSS_VALUE]])) },
  transformTags: {
    img: (tagName, attribs) => {
      if (!/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(attribs.src ?? "")) delete attribs.src;
      return { tagName, attribs };
    },
  },
});
export const sanitizeRunningFragment = sanitizeHtml;
