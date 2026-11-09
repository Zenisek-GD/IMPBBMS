import { spawn, execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readdirSync } from "node:fs";
import { mkdir, open, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import mysql from "mysql2/promise";
import { createTarGzBuffer, inspectTarGz, extractTarGz } from "./tarArchive.js";
import { splitSqlStatements, executeStatementsInBatches, executeSqlWithNativeClient } from "./sqlRunner.js";

// Global in-memory restore state lock
let currentRestoreState = {
  inProgress: false,
  startedAt: null,
  restoredBy: null,
};

export function isRestoreInProgress() {
  return currentRestoreState.inProgress;
}

export function getRestoreState() {
  return { ...currentRestoreState };
}

export function setRestoreState(inProgress, details = {}) {
  currentRestoreState = {
    inProgress,
    startedAt: inProgress ? new Date().toISOString() : null,
    restoredBy: details.restoredBy ?? null,
  };
}

/**
 * Discovers the path to a MySQL binary (mysqldump or mysql) on the system.
 */
export function findMysqlBinary(binaryName = "mysqldump") {
  const envVar = binaryName === "mysqldump" ? process.env.MYSQLDUMP_PATH : process.env.MYSQL_PATH;
  if (envVar && existsSync(envVar)) return envVar;

  // Check PATH first
  try {
    const cmd = process.platform === "win32" ? `where.exe ${binaryName}` : `which ${binaryName}`;
    const output = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }).trim();
    const firstLine = output.split(/\r?\n/)[0]?.trim();
    if (firstLine && existsSync(firstLine)) return firstLine;
  } catch {
    // Continue searching known directory locations
  }

  // Windows / Laragon standard directory locations
  if (process.platform === "win32") {
    const laragonMysqlRoot = "C:/laragon/bin/mysql";
    if (existsSync(laragonMysqlRoot)) {
      try {
        const subdirs = readdirSync(laragonMysqlRoot);
        for (const dir of subdirs) {
          const candidate = path.join(laragonMysqlRoot, dir, "bin", `${binaryName}.exe`);
          if (existsSync(candidate)) return candidate;
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Collects complete statistical metadata from the active database.
 */
export async function getDatabaseStatistics(connection, databaseName) {
  const [tables] = await connection.query("SHOW TABLES");
  const tableRows = {};
  let totalRows = 0;

  for (const t of tables) {
    const tableName = Object.values(t)[0];
    const [[{ count }]] = await connection.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
    tableRows[tableName] = Number(count);
    totalRows += Number(count);
  }

  let documentCount = 0;
  let documentBytes = 0;
  if (tableRows.documents !== undefined) {
    const [[docStats]] = await connection.query(
      "SELECT COUNT(*) as cnt, COALESCE(SUM(sizeBytes), 0) as bytes FROM `documents`"
    );
    documentCount = Number(docStats.cnt);
    documentBytes = Number(docStats.bytes);
  }

  let userCount = 0;
  if (tableRows.users !== undefined) {
    const [[userStats]] = await connection.query("SELECT COUNT(*) as cnt FROM `users`");
    userCount = Number(userStats.cnt);
  }

  let lguName = "Municipality";
  let incomeClass = "1st Class";
  if (tableRows.systemsettings !== undefined) {
    const [settings] = await connection.query(
      "SELECT `key`, `value` FROM `systemsettings` WHERE `key` IN ('lgu.name', 'lgu_name', 'lgu.incomeClass', 'lgu_income_class')"
    );
    for (const s of settings) {
      if ((s.key === "lgu.name" || s.key === "lgu_name") && s.value) lguName = s.value;
      if ((s.key === "lgu.incomeClass" || s.key === "lgu_income_class") && s.value) incomeClass = s.value;
    }
  }

  return {
    databaseName,
    tableCount: Object.keys(tableRows).length,
    tableRows,
    totalRows,
    documentCount,
    documentBytes,
    userCount,
    lguProfile: { lguName, incomeClass },
  };
}

/**
 * Pure JavaScript fallback dumper when mysqldump is unavailable.
 */
export async function dumpDatabaseSqlPureJs(connection, databaseName) {
  const chunks = [];
  chunks.push(`-- IMPBBMS Pure JS Database Backup\n`);
  chunks.push(`-- Database: \`${databaseName}\`\n\n`);
  chunks.push(`/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n`);
  chunks.push(`/*!40101 SET NAMES utf8mb4 */;\n`);
  chunks.push(`/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;\n`);
  chunks.push(`/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;\n\n`);

  const [tables] = await connection.query("SHOW TABLES");

  for (const t of tables) {
    const tableName = Object.values(t)[0];
    chunks.push(`-- Table structure for table \`${tableName}\`\n`);
    chunks.push(`DROP TABLE IF EXISTS \`${tableName}\`;\n`);
    const [[createTable]] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
    chunks.push(`${createTable["Create Table"]};\n\n`);

    // Ephemeral tables skip data rows
    if (["loginsessions", "ratelimitbuckets", "otpchallenges"].includes(tableName)) {
      continue;
    }

    const [rows] = await connection.query(`SELECT * FROM \`${tableName}\``);
    if (rows.length > 0) {
      chunks.push(`-- Dumping data for table \`${tableName}\`\n`);
      const rowInserts = [];
      for (const row of rows) {
        const values = Object.values(row).map((val) => {
          if (val === null || val === undefined) return "NULL";
          if (Buffer.isBuffer(val)) return `0x${val.toString("hex")}`;
          if (typeof val === "number" || typeof val === "bigint") return String(val);
          if (typeof val === "boolean") return val ? "1" : "0";
          if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
          if (typeof val === "object") return mysql.escape(JSON.stringify(val));
          return mysql.escape(String(val));
        });
        rowInserts.push(`(${values.join(",")})`);
      }

      // Batch inserts in groups of 50
      for (let i = 0; i < rowInserts.length; i += 50) {
        const slice = rowInserts.slice(i, i + 50);
        chunks.push(`INSERT INTO \`${tableName}\` VALUES ${slice.join(",\n")};\n`);
      }
      chunks.push("\n");
    }
  }

  chunks.push(`/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;\n`);

  return chunks.join("");
}

/**
 * Creates an SQL dump using mysqldump if available, or fallback to pure JS dumper.
 */
export async function dumpDatabaseToSqlFile({ config, destinationSqlPath, mysqldumpPath }) {
  const binary = mysqldumpPath ?? findMysqlBinary("mysqldump");
  const database = config.database;
  const username = config.username ?? config.user ?? "root";
  const password = String(config.password ?? "");
  const host = config.host ?? "127.0.0.1";
  const port = Number(config.port ?? 3306);

  if (binary) {
    const args = [
      "--no-defaults",
      `--host=${host}`,
      `--port=${port}`,
      `--user=${username}`,
      "--protocol=TCP",
      "--single-transaction",
      "--hex-blob",
      "--routines",
      "--triggers",
      "--events",
      "--no-tablespaces",
      "--default-character-set=utf8mb4",
      database,
    ];

    const file = await open(destinationSqlPath, "wx", 0o600);
    const output = createWriteStream(destinationSqlPath, { fd: file.fd, autoClose: false });

    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MYSQL_PWD: password },
    });

    const completed = new Promise((resolve, reject) => {
      child.once("error", (err) => reject(new Error(`mysqldump could not start: ${err.message}`)));
      child.once("close", (code, signal) => {
        if (code === 0 && !signal) resolve();
        else reject(new Error(`mysqldump exited with code ${code}`));
      });
    });

    child.stderr?.on("error", () => {});
    child.stderr?.resume();

    await Promise.all([completed, pipeline(child.stdout, output)]);
    await file.sync();
    await file.close();

    // Append post-restore cleanup for ephemeral tables if they exist
    // Handled dynamically during post-restore to prevent failures on optional tables.
  } else {
    // Pure JavaScript fallback
    const conn = await mysql.createConnection({ host, port, user: username, password, database });
    try {
      const sql = await dumpDatabaseSqlPureJs(conn, database);
      await writeFile(destinationSqlPath, sql, "utf8");
    } finally {
      await conn.end();
    }
  }

  const { size } = await stat(destinationSqlPath);
  if (size === 0) throw new Error("Database dump produced an empty file.");

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(destinationSqlPath)) {
    hash.update(chunk);
  }

  return { path: destinationSqlPath, bytes: size, sha256: hash.digest("hex") };
}

/**
 * Creates a complete portable backup package (.tar.gz) containing manifest.json,
 * database.sql, and checksums.json.
 */
export async function createSystemBackup({
  config,
  backupDirectory,
  label = "manual",
  createdBy = null,
  mysqldumpPath = null,
}) {
  const host = config.host ?? "127.0.0.1";
  const port = Number(config.port ?? 3306);
  const user = config.username ?? config.user ?? "root";
  const password = String(config.password ?? "");
  const database = config.database;

  await mkdir(backupDirectory, { recursive: true });

  const conn = await mysql.createConnection({ host, port, user, password, database });
  let statistics;
  try {
    statistics = await getDatabaseStatistics(conn, database);
  } finally {
    await conn.end();
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const uniqueId = randomUUID().slice(0, 8);
  const tempDir = await mkdir(path.join(os.tmpdir(), `impbbms-dump-${timestamp}-${uniqueId}`), { recursive: true });
  const tempSqlPath = path.join(os.tmpdir(), `impbbms-dump-${timestamp}-${uniqueId}`, "database.sql");

  try {
    const dumpResult = await dumpDatabaseToSqlFile({
      config,
      destinationSqlPath: tempSqlPath,
      mysqldumpPath,
    });

    const manifest = {
      formatVersion: "1.0.0",
      type: "impbbms-complete-backup",
      createdAt: new Date().toISOString(),
      label,
      createdBy: createdBy ? { id: createdBy.id, name: createdBy.name, role: createdBy.Role?.name ?? createdBy.role } : null,
      source: {
        app: "IMPBBMS",
        appVersion: "1.0.0",
        databaseName: database,
        host,
        port,
        lguProfile: statistics.lguProfile,
      },
      payload: {
        file: "database.sql",
        bytes: dumpResult.bytes,
        sha256: dumpResult.sha256,
      },
      statistics: {
        tableCount: statistics.tableCount,
        tableRows: statistics.tableRows,
        totalRows: statistics.totalRows,
        documentCount: statistics.documentCount,
        documentBytes: statistics.documentBytes,
        userCount: statistics.userCount,
      },
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestHash = createHash("sha256").update(manifestJson).digest("hex");
    const checksums = {
      "manifest.json": manifestHash,
      "database.sql": dumpResult.sha256,
    };

    const sqlBuffer = await readFile(tempSqlPath);
    const archiveBuffer = createTarGzBuffer([
      { name: "manifest.json", content: manifestJson },
      { name: "database.sql", content: sqlBuffer },
      { name: "checksums.json", content: JSON.stringify(checksums, null, 2) },
    ]);

    const packageFileName = `impbbms-backup-${timestamp}-${uniqueId}.tar.gz`;
    const finalPackagePath = path.join(backupDirectory, packageFileName);
    await writeFile(finalPackagePath, archiveBuffer);

    const packageHash = createHash("sha256").update(archiveBuffer).digest("hex");

    return {
      filename: packageFileName,
      path: finalPackagePath,
      bytes: archiveBuffer.length,
      sha256: packageHash,
      manifest,
    };
  } finally {
    await rm(path.join(os.tmpdir(), `impbbms-dump-${timestamp}-${uniqueId}`), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Validates and inspects a backup package without applying any changes.
 */
export async function inspectSystemBackup(backupPathOrBuffer, currentConfig = null) {
  const archiveBuffer = Buffer.isBuffer(backupPathOrBuffer)
    ? backupPathOrBuffer
    : await readFile(backupPathOrBuffer);

  const entries = inspectTarGz(archiveBuffer);
  const entryMap = new Map(entries.map((e) => [e.name, e]));

  const manifestEntry = entryMap.get("manifest.json");
  if (!manifestEntry) {
    throw new Error("Invalid backup package: missing manifest.json");
  }

  const sqlEntry = entryMap.get("database.sql");
  if (!sqlEntry) {
    throw new Error("Invalid backup package: missing database.sql payload");
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString("utf8"));
  } catch {
    throw new Error("Corrupted manifest.json in backup package.");
  }

  if (manifest.formatVersion !== "1.0.0") {
    throw new Error(`Unsupported backup format version: ${manifest.formatVersion}`);
  }

  // Verify SHA-256 payload integrity
  const actualSqlHash = createHash("sha256").update(sqlEntry.data).digest("hex");
  if (actualSqlHash !== manifest.payload.sha256) {
    throw new Error("Integrity check failed: database.sql payload checksum mismatch.");
  }

  // Verify independent checksums.json integrity when present
  const checksumsEntry = entryMap.get("checksums.json");
  if (checksumsEntry) {
    let checksums;
    try {
      checksums = JSON.parse(checksumsEntry.data.toString("utf8"));
    } catch {
      throw new Error("Corrupted checksums.json in backup package.");
    }
    const manifestActualHash = createHash("sha256").update(manifestEntry.data).digest("hex");
    if (checksums["manifest.json"] && checksums["manifest.json"] !== manifestActualHash) {
      throw new Error("Integrity check failed: checksums.json mismatch for manifest.json.");
    }
    if (checksums["database.sql"] && checksums["database.sql"] !== actualSqlHash) {
      throw new Error("Integrity check failed: checksums.json mismatch for database.sql.");
    }
  }

  // Gather current database info if currentConfig provided
  let currentStats = null;
  if (currentConfig?.database) {
    try {
      const conn = await mysql.createConnection({
        host: currentConfig.host ?? "127.0.0.1",
        port: Number(currentConfig.port ?? 3306),
        user: currentConfig.username ?? currentConfig.user ?? "root",
        password: String(currentConfig.password ?? ""),
        database: currentConfig.database,
      });
      currentStats = await getDatabaseStatistics(conn, currentConfig.database);
      await conn.end();
    } catch {
      // Database may not exist yet in fresh deployment
    }
  }

  return {
    valid: true,
    manifest,
    sqlBytes: sqlEntry.size,
    currentStats,
  };
}

/**
 * Restores a backup package into the target database.
 */
export async function restoreSystemBackup({
  backupPathOrBuffer,
  config,
  targetDatabase = null,
  safetyBackupDirectory = null,
  restoredBy = null,
  mysqlPath = null,
  onProgress = null,
  rebaselineHook = null,
}) {
  const targetDb = targetDatabase ?? config.database;
  if (!targetDb || typeof targetDb !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_$-]*$/.test(targetDb)) {
    throw new Error("A valid target database name is required for restoration.");
  }

  const SYSTEM_DATABASES = new Set(["mysql", "information_schema", "performance_schema", "sys"]);
  if (SYSTEM_DATABASES.has(targetDb.toLowerCase())) {
    throw new Error(`Restoration into system database '${targetDb}' is strictly prohibited.`);
  }

  const inspection = await inspectSystemBackup(backupPathOrBuffer, { ...config, database: targetDb });
  const manifest = inspection.manifest;

  // Prevent concurrent restores
  if (isRestoreInProgress()) {
    throw new Error("Another database restoration operation is currently in progress.");
  }

  setRestoreState(true, { restoredBy });

  const host = config.host ?? "127.0.0.1";
  const port = Number(config.port ?? 3306);
  const user = config.username ?? config.user ?? "root";
  const password = String(config.password ?? "");

  let safetyBackupPath = null;
  const tempExtractDir = await mkdir(path.join(os.tmpdir(), `impbbms-restore-${Date.now()}`), { recursive: true });

  try {
    // 1. Check if target database exists and create pre-restore safety snapshot if it contains data
    const rootConn = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
    try {
      const [dbRows] = await rootConn.query("SHOW DATABASES LIKE ?", [targetDb]);
      if (dbRows.length > 0) {
        await rootConn.query(`USE \`${targetDb}\``);
        const [tables] = await rootConn.query("SHOW TABLES");
        if (tables.length > 0 && safetyBackupDirectory) {
          try {
            await mkdir(safetyBackupDirectory, { recursive: true });
            const safetyFilename = `${targetDb}-pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
            const safetyPath = path.join(safetyBackupDirectory, safetyFilename);
            await dumpDatabaseToSqlFile({
              config: { ...config, database: targetDb },
              destinationSqlPath: safetyPath,
              mysqldumpPath: findMysqlBinary("mysqldump"),
            });
            if (existsSync(safetyPath)) safetyBackupPath = safetyPath;
          } catch (err) {
            throw new Error(`Failed to create pre-restore safety snapshot for database '${targetDb}': ${err.message}. Aborting restoration to prevent data loss.`);
          }
        }
      } else {
        await rootConn.query(`CREATE DATABASE \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      }
    } finally {
      await rootConn.end();
    }

    // 2. Extract SQL script to temporary directory
    const archiveBuffer = Buffer.isBuffer(backupPathOrBuffer)
      ? backupPathOrBuffer
      : await readFile(backupPathOrBuffer);
    const extracted = await extractTarGz(archiveBuffer, tempExtractDir);
    const sqlFile = extracted.find((e) => e.name === "database.sql");
    if (!sqlFile) throw new Error("database.sql missing from extracted backup.");

    // 3. Execute restoration
    const nativeClient = mysqlPath ?? findMysqlBinary("mysql");
    let usedNative = false;

    if (nativeClient) {
      try {
        await executeSqlWithNativeClient({
          config: { ...config, database: targetDb },
          sqlPath: sqlFile.path,
          mysqlPath: nativeClient,
        });
        usedNative = true;
      } catch (err) {
        console.warn("[restore] Native mysql client failed, falling back to pure-JS SQL runner:", err.message);
      }
    }

    if (!usedNative) {
      const sqlContent = await readFile(sqlFile.path, "utf8");
      const statements = splitSqlStatements(sqlContent);
      const restoreConn = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database: targetDb,
        multipleStatements: true,
      });

      try {
        await restoreConn.query("SET FOREIGN_KEY_CHECKS=0;");
        await executeStatementsInBatches(restoreConn, statements, {
          batchSize: 50,
          onProgress,
        });
        await restoreConn.query("SET FOREIGN_KEY_CHECKS=1;");
      } finally {
        await restoreConn.end();
      }
    }

    // 4. Post-restore Verification & Ephemeral Cleanup
    const verifyConn = await mysql.createConnection({ host, port, user, password, database: targetDb });
    
    // Reset ephemeral sessions and rate limits so fresh deployment starts clean
    for (const ephem of ["loginsessions", "ratelimitbuckets", "otpchallenges"]) {
      const [exists] = await verifyConn.query("SHOW TABLES LIKE ?", [ephem]);
      if (exists.length > 0) {
        await verifyConn.query(`TRUNCATE TABLE \`${ephem}\``);
      }
    }

    const postStats = await getDatabaseStatistics(verifyConn, targetDb);

    const tableDetails = [];
    let mismatchCount = 0;

    for (const [table, expectedCount] of Object.entries(manifest.statistics.tableRows)) {
      const actualCount = postStats.tableRows[table] ?? 0;
      const isMatch = actualCount === expectedCount;
      if (!isMatch && !["loginsessions", "ratelimitbuckets", "otpchallenges"].includes(table)) {
        mismatchCount++;
      }
      tableDetails.push({
        table,
        expectedRows: expectedCount,
        restoredRows: actualCount,
        status: isMatch || ["loginsessions", "ratelimitbuckets", "otpchallenges"].includes(table) ? "ok" : "mismatch",
      });
    }

    // Verify document checksums
    let verifiedDocuments = 0;
    if (postStats.tableRows.documents > 0) {
      const [docs] = await verifyConn.query("SELECT id, filename, checksum, SHA2(content, 256) as actualChecksum FROM `documents`");
      for (const doc of docs) {
        if (doc.checksum === doc.actualChecksum) verifiedDocuments++;
        else console.warn(`[restore] Document #${doc.id} (${doc.filename}) checksum mismatch!`);
      }
    }

    await verifyConn.end();

    // 5. Rebaseline integrity monitor if hook provided or available
    if (rebaselineHook) {
      await rebaselineHook().catch((err) => {
        console.warn("[restore] rebaselineIntegrity failed:", err.message);
      });
    }

    return {
      success: mismatchCount === 0,
      restoredAt: new Date().toISOString(),
      targetDatabase: targetDb,
      tablesRestored: postStats.tableCount,
      totalRowsRestored: postStats.totalRows,
      verifiedDocuments,
      mismatchCount,
      tableDetails,
      safetyBackupPath,
      manifest,
    };
  } catch (err) {
    if (safetyBackupPath) {
      err.safetyBackupPath = safetyBackupPath;
    }
    err.targetDatabase = targetDb;
    throw err;
  } finally {
    setRestoreState(false);
    await rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
  }
}
