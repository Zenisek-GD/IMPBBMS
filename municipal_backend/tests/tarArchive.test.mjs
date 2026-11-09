import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createTarHeader,
  createTarGzBuffer,
  createTarGzFile,
  parseTarBuffer,
  inspectTarGz,
  extractTarGz,
} from "../services/tarArchive.js";

test("tar archive creation, inspection and extraction preserves binary content and paths", async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-tar-test-"));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  const manifest = JSON.stringify({ version: "1.0.0", test: true });
  const sql = "SELECT * FROM users WHERE active = 1;\n-- Comment with unicode: ñ, é\n";
  const binaryBlob = Buffer.from([0x00, 0xff, 0x12, 0x34, 0xaa, 0xbb]);

  const entries = [
    { name: "manifest.json", content: manifest },
    { name: "database.sql", content: sql },
    { name: "checksums.json", content: binaryBlob },
  ];

  const gzBuffer = createTarGzBuffer(entries);
  assert.ok(gzBuffer.length > 0, "Buffer should not be empty");

  // Inspect without extracting to disk
  const inspected = inspectTarGz(gzBuffer);
  assert.equal(inspected.length, 3);
  assert.equal(inspected[0].name, "manifest.json");
  assert.equal(inspected[0].data.toString("utf8"), manifest);
  assert.equal(inspected[1].name, "database.sql");
  assert.equal(inspected[1].data.toString("utf8"), sql);
  assert.equal(inspected[2].name, "checksums.json");
  assert.deepEqual(inspected[2].data, binaryBlob);

  // Extract to filesystem
  const extractDir = path.join(tmpDir, "extracted");
  const extracted = await extractTarGz(gzBuffer, extractDir);
  assert.equal(extracted.length, 3);

  const manifestDisk = await fs.readFile(path.join(extractDir, "manifest.json"), "utf8");
  assert.equal(manifestDisk, manifest);

  const sqlDisk = await fs.readFile(path.join(extractDir, "database.sql"), "utf8");
  assert.equal(sqlDisk, sql);

  const binDisk = await fs.readFile(path.join(extractDir, "checksums.json"));
  assert.deepEqual(binDisk, binaryBlob);
});

test("tar extraction rejects directory traversal attempts", async (t) => {
  const maliciousHeader = createTarHeader("../../../evil.txt", 10);
  const maliciousData = Buffer.from("malicious!");
  const pad = Buffer.alloc(512 - (maliciousData.length % 512));
  const end = Buffer.alloc(1024);
  const rawTar = Buffer.concat([maliciousHeader, maliciousData, pad, end]);
  const gzip = (await import("node:zlib")).gzipSync(rawTar);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "impbbms-tar-sec-"));
  t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

  // Extraction strictly rejects traversal attempts
  await assert.rejects(
    extractTarGz(gzip, tmpDir),
    /Unauthorized or invalid filename in backup package/i
  );
});

test("corrupted gzip or tar buffer throws descriptive error", async () => {
  const corrupted = Buffer.from("not a real gzip buffer");
  assert.throws(() => inspectTarGz(corrupted), /corrupted/);
});
