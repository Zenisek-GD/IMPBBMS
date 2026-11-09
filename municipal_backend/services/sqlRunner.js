import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import mysql from "mysql2/promise";

/**
 * Splits an SQL script string into individual executable statements.
 * Correctly handles:
 * - Single quotes ('...'), double quotes ("..."), and backticks (`...`)
 * - Escaped quotes inside strings (\' and '')
 * - Line comments (-- and #)
 * - Block comments (/* ... *\/)
 * - Retains MySQL versioned execution comments (/*!40101 ... *\/)
 * - Semicolons inside string literals are NOT treated as statement terminators
 */
export function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;
  let currentDelimiter = ";";
  const len = sqlText.length;

  for (let i = 0; i < len; i++) {
    const char = sqlText[i];
    const next = i + 1 < len ? sqlText[i + 1] : "";

    // 1. Line comment handling
    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }

    // 2. Block comment handling
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    // 3. String literal & identifier handling
    if (inString) {
      current += char;
      // In MySQL, backticks (`) are NOT escaped by backslash (\).
      // Only single quotes (') and double quotes (") recognize backslash escaping.
      if (stringChar !== "`" && char === "\\") {
        if (next) {
          current += next;
          i++;
        }
      } else if (char === stringChar) {
        if (next === stringChar) {
          // Escaped quote or backtick: e.g. '' or "" or ``
          current += next;
          i++;
        } else {
          inString = false;
        }
      }
      continue;
    }

    // 4. DELIMITER directive check (case-insensitive word at start of statement / line)
    if (!current.trim() || current.trim().length === 0) {
      if ((i === 0 || /\s/.test(sqlText[i - 1])) && sqlText.slice(i, i + 10).toLowerCase().startsWith("delimiter ")) {
        // Read until newline
        const lineEnd = sqlText.indexOf("\n", i);
        const delimLine = lineEnd !== -1 ? sqlText.slice(i, lineEnd) : sqlText.slice(i);
        const match = delimLine.match(/^delimiter\s+(\S+)/i);
        if (match) {
          currentDelimiter = match[1].trim();
          i = lineEnd !== -1 ? lineEnd : len - 1;
          continue;
        }
      }
    }

    // 5. Comment detection
    if (char === "-" && next === "-" && (i + 2 >= len || /\s/.test(sqlText[i + 2]))) {
      inLineComment = true;
      i++;
      continue;
    }
    if (char === "#" && (i === 0 || /\s/.test(sqlText[i - 1]))) {
      inLineComment = true;
      continue;
    }
    if (char === "/" && next === "*") {
      // Keep MySQL versioned comments: /*!... */
      if (i + 2 < len && sqlText[i + 2] === "!") {
        current += char;
        continue;
      }
      inBlockComment = true;
      i++;
      continue;
    }

    // 6. String delimiter detection
    if (char === "'" || char === '"' || char === "`") {
      inString = true;
      stringChar = char;
      current += char;
      continue;
    }

    // 7. Statement terminator matching current delimiter
    const delimLen = currentDelimiter.length;
    if (sqlText.slice(i, i + delimLen) === currentDelimiter) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      i += delimLen - 1;
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

/**
 * Executes an array of SQL statements in batches over a mysql2 connection.
 */
export async function executeStatementsInBatches(connection, statements, { batchSize = 40, onProgress } = {}) {
  let executedCount = 0;
  let batch = [];
  let batchCharLength = 0;
  const MAX_BATCH_CHARS = 1024 * 1024; // 1MB batch limit to stay well within max_allowed_packet

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    batch.push(stmt);
    batchCharLength += stmt.length;

    if (batch.length >= batchSize || batchCharLength >= MAX_BATCH_CHARS || i === statements.length - 1) {
      const combinedSql = batch.join(";\n") + ";";
      await connection.query(combinedSql);
      executedCount += batch.length;
      if (onProgress) onProgress(executedCount, statements.length);
      batch = [];
      batchCharLength = 0;
    }
  }

  return executedCount;
}

/**
 * Attempts to execute an SQL file using the native `mysql` CLI executable if present.
 */
export async function executeSqlWithNativeClient({ config, sqlPath, mysqlPath = "mysql" }) {
  const host = config?.host ?? "127.0.0.1";
  const port = Number(config?.port ?? 3306);
  const user = config?.user ?? config?.username ?? "root";
  const database = config?.database;

  const args = [
    "--no-defaults",
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    "--protocol=TCP",
    "--default-character-set=utf8mb4",
    database,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(mysqlPath, args, {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"],
      env: { ...process.env, MYSQL_PWD: String(config.password ?? "") },
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mysql command exited with code ${code}: ${stderr.slice(0, 500)}`));
    });

    const readStream = createReadStream(sqlPath);
    readStream.pipe(child.stdin);
    readStream.on("error", (err) => {
      child.kill();
      reject(err);
    });
  });
}
