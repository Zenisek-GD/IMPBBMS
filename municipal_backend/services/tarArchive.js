import zlib from "node:zlib";
import fs from "node:fs";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * Creates a standard POSIX USTAR 512-byte header block for a file entry.
 */
export function createTarHeader(name, size, mode = 0o644, mtime = Math.floor(Date.now() / 1000)) {
  const buf = Buffer.alloc(512);

  // 0-99: File name (null-terminated)
  buf.write(name, 0, 100, "utf8");

  // 100-107: File mode (octal string, 6 digits + space + null)
  buf.write(mode.toString(8).padStart(6, "0") + " \0", 100, 8, "ascii");

  // 108-115: Owner UID (octal)
  buf.write((0).toString(8).padStart(6, "0") + " \0", 108, 8, "ascii");

  // 116-123: Group GID (octal)
  buf.write((0).toString(8).padStart(6, "0") + " \0", 116, 8, "ascii");

  // 124-135: File size in bytes (11 octal digits + space)
  buf.write(size.toString(8).padStart(11, "0") + " ", 124, 12, "ascii");

  // 136-147: Last modification time (11 octal digits + space)
  buf.write(mtime.toString(8).padStart(11, "0") + " ", 136, 12, "ascii");

  // 148-155: Checksum field is filled with 8 ASCII spaces before computing checksum
  buf.fill(0x20, 148, 156);

  // 156: Type flag ('0' = regular file)
  buf.write("0", 156, 1, "ascii");

  // 257-262: USTAR magic
  buf.write("ustar\0", 257, 6, "ascii");

  // 263-264: USTAR version
  buf.write("00", 263, 2, "ascii");

  // Compute checksum of the entire 512-byte block
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += buf[i];

  // Write checksum as 6 octal digits followed by null and space
  buf.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

  return buf;
}

/**
 * Creates a .tar.gz archive Buffer from an array of entries.
 * Each entry is: { name: string, content: Buffer | string, mode?: number }
 */
export function createTarGzBuffer(entries) {
  const chunks = [];

  for (const entry of entries) {
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, "utf8");
    const header = createTarHeader(entry.name, content.length, entry.mode ?? 0o644);
    chunks.push(header);
    chunks.push(content);

    // Padding to 512-byte boundary
    const remainder = content.length % 512;
    if (remainder !== 0) {
      chunks.push(Buffer.alloc(512 - remainder));
    }
  }

  // End of archive: two consecutive 512-byte blocks of zeroes
  chunks.push(Buffer.alloc(1024));

  const tarBuffer = Buffer.concat(chunks);
  return zlib.gzipSync(tarBuffer, { level: 9 });
}

/**
 * Creates a .tar.gz file at destinationPath from an array of entries or files.
 */
export async function createTarGzFile(destinationPath, entries) {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const gzBuffer = createTarGzBuffer(entries);
  await writeFile(destinationPath, gzBuffer);
  return { path: destinationPath, bytes: gzBuffer.length };
}

/**
 * Parses an uncompressed tar buffer into file entries.
 */
export function parseTarBuffer(uncompressedTarBuffer) {
  const entries = [];
  let offset = 0;

  while (offset + 512 <= uncompressedTarBuffer.length) {
    const header = uncompressedTarBuffer.subarray(offset, offset + 512);

    // End of archive is marked by two consecutive blocks of zeroes
    if (header.every((b) => b === 0)) break;

    const name = header.toString("utf8", 0, 100).replace(/\0+$/, "").trim();
    if (!name) break;

    const sizeStr = header.toString("ascii", 124, 136).trim().replace(/\0+$/, "");
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;

    if (offset + size > uncompressedTarBuffer.length) {
      throw new Error(`Corrupted tar archive: entry ${name} exceeds archive boundary.`);
    }

    const data = uncompressedTarBuffer.subarray(offset, offset + size);
    entries.push({ name, size, data });

    // Move past padding
    const remainder = size % 512;
    const padding = remainder === 0 ? 0 : 512 - remainder;
    offset += size + padding;
  }

  return entries;
}

/**
 * Inspects a .tar.gz file or buffer without writing to disk.
 * Returns map of entries with { name, size, data }
 */
export function inspectTarGz(tarGzBuffer) {
  try {
    const uncompressed = zlib.gunzipSync(tarGzBuffer);
    return parseTarBuffer(uncompressed);
  } catch (error) {
    throw new Error(`Invalid or corrupted backup archive: ${error.message}`);
  }
}

export const ALLOWED_ARCHIVE_ENTRIES = new Set([
  "manifest.json",
  "database.sql",
  "checksums.json",
]);

/**
 * Extracts a .tar.gz buffer into a destination directory.
 */
export async function extractTarGz(tarGzBuffer, destinationDirectory) {
  await mkdir(destinationDirectory, { recursive: true });
  const entries = inspectTarGz(tarGzBuffer);
  const extractedFiles = [];

  for (const entry of entries) {
    const rawName = entry.name.trim();

    // Reject entries containing path separators, parent traversal, or null bytes
    if (rawName.includes("/") || rawName.includes("\\") || rawName.includes("\0") || rawName.includes("..")) {
      throw new Error(`Unauthorized or invalid filename in backup package: ${rawName}`);
    }

    // Strict allowlist: only known backup artifact names are permitted
    if (!ALLOWED_ARCHIVE_ENTRIES.has(rawName)) {
      throw new Error(`Unauthorized or invalid filename in backup package: ${rawName}`);
    }

    const targetPath = path.join(destinationDirectory, rawName);

    // Double-check path stays strictly inside destination directory
    const relative = path.relative(destinationDirectory, targetPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Insecure file path detected in backup package: ${entry.name}`);
    }

    await writeFile(targetPath, entry.data);
    extractedFiles.push({ name: rawName, path: targetPath, size: entry.size });
  }

  return extractedFiles;
}
