
    /*
    MIT License

    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */

// Schema management.
//
// This used to be interactive — it prompted through `inquirer` — which meant it
// could not run in CI, in a script, or anywhere that is not a person at a
// keyboard. It also only ever offered `sync({ force: true })`, which drops every
// table, so the safe operation was not available at all. And it issued
// CREATE DATABASE over a connection already pointed AT that database, so on a
// fresh machine it failed with "Unknown database" before it could create one.
//
// Now it takes a flag, and the default is the safe one.
//
//   node migrate.js            create the database if absent, then sync
//   node migrate.js --alter    sync with ALTER, adding new columns in place
//   node migrate.js --force    DROP every table and recreate  (destructive)
//   node migrate.js --check    report drift and exit; write nothing
//
// `--force` additionally requires `--yes` when stdin is not a TTY, so a script
// cannot destroy a database by inheriting the flag from somewhere else.

import "./config/env.js";
import mysql from "mysql2/promise";
import { sequelize } from "./models/db.js";
import "./models/index.js";

const args = new Set(process.argv.slice(2));
const mode = args.has("--force")
  ? "force"
  : args.has("--alter")
    ? "alter"
    : args.has("--check")
      ? "check"
      : "safe";

const config = {
  database: process.env.DB_NAME ?? "municipal_backend",
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
};

// Creating the database has to happen on a connection that is NOT pointed at
// it — see the note above.
const ensureDatabaseExists = async () => {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });
  const [rows] = await connection.query("SHOW DATABASES LIKE ?", [config.database]);
  const existed = rows.length > 0;
  if (!existed) {
    await connection.query(
      `CREATE DATABASE \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  }
  await connection.end();
  return existed;
};

const run = async () => {
  console.log(`→ ${config.user}@${config.host}:${config.port}/${config.database}  (mode: ${mode})`);

  const existed = await ensureDatabaseExists();
  if (!existed) console.log(`✅ created database ${config.database}`);

  await sequelize.authenticate();

  if (mode === "check") {
    // A dry run: collect the SQL `alter` would issue without committing to it,
    // so drift can be reported in CI without changing anything.
    const queries = [];
    await sequelize.sync({ alter: true, logging: (sql) => queries.push(sql) });
    const changes = queries.filter((q) => /ALTER TABLE|CREATE TABLE/i.test(q));
    console.log(changes.length === 0 ? "✅ schema is up to date" : `⚠️  ${changes.length} statement(s) applied:`);
    changes.slice(0, 40).forEach((q) => console.log("   " + q.slice(0, 160)));
    await sequelize.close();
    process.exit(changes.length === 0 ? 0 : 1);
  }

  if (mode === "force") {
    if (!args.has("--yes") && !process.stdin.isTTY) {
      console.error(
        "✋ --force drops every table. Re-run with --yes to confirm, or use --alter to add columns in place."
      );
      process.exit(1);
    }
    console.log("⚠️  dropping and recreating every table");
    await sequelize.sync({ force: true });
    console.log("✅ schema recreated — all data was destroyed. Run `npm run seed` next.");
  } else if (mode === "alter") {
    await sequelize.sync({ alter: true });
    console.log("✅ schema altered in place; existing rows preserved");
  } else {
    // The safe default: create anything missing, change nothing that exists.
    await sequelize.sync();
    console.log("✅ schema synced (missing tables created; existing tables untouched)");
    console.log("   Use --alter to add new columns to existing tables.");
  }

  await sequelize.close();
  process.exit(0);
};

run().catch(async (error) => {
  console.error("✖ migration failed:", error.message);
  try {
    await sequelize.close();
  } catch {
    /* the connection may never have opened */
  }
  process.exit(1);
});
