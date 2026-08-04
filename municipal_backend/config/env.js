import dotenv from "dotenv";
import path from "path";

// Imported for its side effect, first thing, by every entry point: index.js,
// seed.js, seedDemo.js and migrate.js. Anything that reads process.env at module
// scope — models/db.js does — must be imported *after* this, so this file has to
// stay side-effect-only and dependency-free.
//
// `override: false` is dotenv's default and is the behaviour we want: a variable
// already set in the real environment (a deployment, a CI job, a one-off
// `SMTP_HOST= npm run seed`) wins over the file.
dotenv.config({ path: path.join(process.cwd(), ".env") });

// Resolved from the process working directory rather than import.meta.url so
// running `npm run seed --prefix municipal_backend` from the repository root
// still finds the file — npm sets cwd to the package directory.
