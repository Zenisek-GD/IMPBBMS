
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
    
import { Sequelize, Utils } from "sequelize";
import mysql2 from "mysql2";

// Sequelize sends parameterised MySQL statements through mysql2's `execute`,
// which uses MySQL's COM_STMT_PREPARE protocol. Hyperdrive currently rejects
// that protocol. Keep Sequelize's parameterisation, but on the Worker format
// the values with mysql2's own escaping and send the resulting ordinary query
// over Hyperdrive. This is the same safe escaping mysql2 uses for `query()`;
// it simply avoids the unsupported prepared-statement wire command.
const hyperdriveMysql2 = {
  ...mysql2,
  createConnection(config) {
    const connection = mysql2.createConnection(config);
    connection.execute = (sql, values, callback) => {
      if (typeof values === "function") {
        callback = values;
        values = undefined;
      }
      return connection.query({ sql: mysql2.format(sql, values) }, callback);
    };
    return connection;
  },
};

// Credentials come from the environment, falling back to the local development
// defaults. Hardcoding them meant the same file had to be edited to deploy, and
// a real password would have been committed to source control to do it.
//
// Set DB_NAME / DB_USER / DB_PASSWORD / DB_HOST in the environment, or run with
// `node --env-file=.env index.js`.
export const sequelize = new Sequelize(
  process.env.DB_NAME ?? "municipal_backend",
  process.env.DB_USER ?? "root",
  process.env.DB_PASSWORD ?? "",
  {
    // 127.0.0.1 rather than "localhost": on Windows, localhost resolves to the
    // IPv6 ::1 first, and MySQL binds to IPv4 only by default — so "localhost"
    // fails with ECONNREFUSED on a server that is running perfectly well.
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    dialect: "mysql",
    // Sequelize otherwise loads mysql2 through a dynamic require, which is not
    // supported by the Cloudflare Workers bundler. Supplying the static import
    // keeps the same driver while making the Worker-compatible path explicit.
    dialectModule: process.env.CLOUDFLARE_WORKER === "true" ? hyperdriveMysql2 : mysql2,
    // mysql2 uses eval() for an optimisation that Workers deliberately
    // disallow. Hyperdrive supplies the credentials at Worker startup; this
    // option selects mysql2's compatible static parser there.
    dialectOptions:
      process.env.CLOUDFLARE_WORKER === "true" ? { disableEval: true } : undefined,
    // A Workers TCP socket belongs to the request that created it. Reusing a
    // Sequelize-pool connection in another request produces Cloudflare's
    // cross-request I/O error. Hyperdrive does the real connection pooling at
    // the edge, so in the Worker destroy a mysql2 connection as soon as its
    // query releases it. Local development retains Sequelize's usual pool.
    pool:
      process.env.CLOUDFLARE_WORKER === "true"
        ? { max: 5, min: 0, maxUses: 1, acquire: 30_000, idle: 1_000 }
        : undefined,
    // Query logging is deafening in normal use and hides real errors. On by
    // default only when explicitly asked for.
    logging: process.env.DB_LOGGING === "true" ? console.log : false,
  }
);

// The existing MySQL schema was created on Windows, where table names are
// case-insensitive and Sequelize's default `SystemSettings` resolved to the
// lowercase `systemsettings` table. Aiven runs Linux MySQL, where the names are
// case-sensitive. Keep Sequelize's normal pluralisation, but consistently use
// the lowercase physical table name so both databases address the same schema.
const defineModel = sequelize.define.bind(sequelize);
sequelize.define = (modelName, attributes, options = {}) =>
  defineModel(modelName, attributes, {
    ...options,
    tableName: options.tableName ?? Utils.pluralize(modelName).toLowerCase(),
  });
