import crypto from "crypto";
import multer from "multer";

// Files are buffered in memory and written straight to MySQL — there is no
// temp directory to clean up or leak.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Allow-list, not a block-list. Anything not named here is refused, so a new
// dangerous type cannot slip through by omission.
export const ALLOWED_TYPES = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

// Deliberately excluded: SVG and HTML. Both can carry script, and a browser
// that renders one served from our own origin would run it as us.
const extensionOf = (filename) => {
  const index = filename.lastIndexOf(".");
  return index === -1 ? "" : filename.slice(index).toLowerCase();
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    const permitted = ALLOWED_TYPES[file.mimetype];
    if (!permitted) {
      return callback(new Error(`Files of type ${file.mimetype} are not accepted.`));
    }
    // The declared MIME type and the extension must agree — a client can lie
    // about either one, so requiring both to match closes the easy mismatch.
    if (!permitted.includes(extensionOf(file.originalname))) {
      return callback(new Error(`The file extension does not match its type (${file.mimetype}).`));
    }
    callback(null, true);
  },
});

export const checksumOf = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

// Strips any path components a client may have sent and neutralises characters
// that cause trouble in a Content-Disposition header.
export const safeFilename = (original) =>
  original
    .replace(/^.*[\\/]/, "")
    .replace(/[\r\n"]/g, "")
    .slice(0, 200)
    .trim() || "document";

export const MAX_UPLOAD_BYTES = MAX_FILE_BYTES;

// Multer signals its own failures with a code; translate to something a user
// can act on rather than surfacing a raw stack.
export const describeUploadError = (err) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return `That file is larger than the ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB limit.`;
  }
  if (err?.code === "LIMIT_FILE_COUNT") return "Upload one file at a time.";
  return err?.message ?? "The file could not be uploaded.";
};
