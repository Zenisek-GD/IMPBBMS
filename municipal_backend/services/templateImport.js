import crypto from "crypto";
import multer from "multer";
import { sanitizeHtml } from "./htmlSanitizer.js";
import { sanitizeTemplateCss } from "./templateRenderer.js";

// Template import intentionally accepts the format the document renderer
// understands: HTML. This preserves document tables, inline formatting,
// embedded images and CSS far more faithfully than a lossy conversion from a
// Word file, while sending every imported byte through the same sanitiser as
// manually authored templates.
const MAX_TEMPLATE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const ALLOWED_EXTENSIONS = new Set([".html", ".htm"]);

const extensionOf = (name = "") => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

export const templateImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TEMPLATE_BYTES, files: 1, fields: 6, parts: 7, fieldSize: 8 * 1024, fieldNameSize: 100 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extensionOf(file.originalname))) {
      return callback(new Error("Upload an HTML template file (.html or .htm)."));
    }
    callback(null, true);
  },
});

export const describeTemplateImportError = (error) => {
  if (error?.code === "LIMIT_FILE_SIZE") return "The template file is larger than the 2 MB limit.";
  if (error?.code === "LIMIT_FILE_COUNT") return "Upload one template file at a time.";
  return error?.message ?? "The template file could not be imported.";
};

const bodyOf = (html) => {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  return match ? match[1] : html;
};

const stylesOf = (html) =>
  [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
    .map((match) => match[1])
    .join("\n");

// Returns only the sanitised, renderable representation. The original HTML is
// deliberately not retained: it may contain script or tracking markup, and an
// append-only template history must never become a permanent store of it.
export const importHtmlTemplate = ({ buffer, originalname }) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { error: "The template file is empty." };
  }

  const source = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (source.includes("\0")) return { error: "The template file is not valid UTF-8 HTML." };

  const bodyHtml = sanitizeHtml(bodyOf(source).replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")).trim();
  if (!bodyHtml) return { error: "The template does not contain editable document content." };

  return {
    bodyHtml,
    css: sanitizeTemplateCss(stylesOf(source)),
    sourceFilename: String(originalname ?? "template.html")
      .replace(/^.*[\\/]/, "")
      .replace(/[\r\n"]/g, "")
      .slice(0, 200) || "template.html",
    sourceChecksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
};

export const TEMPLATE_IMPORT_MAX_BYTES = MAX_TEMPLATE_BYTES;
