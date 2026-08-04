
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
    
import { Sequelize } from "sequelize";

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
    // Query logging is deafening in normal use and hides real errors. On by
    // default only when explicitly asked for.
    logging: process.env.DB_LOGGING === "true" ? console.log : false,
  }
);