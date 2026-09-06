# Cloudflare deployment — no custom domain needed

This repository now deploys as **one Cloudflare Worker**. It serves the Vite
React application and Express API at the same URL:

```text
https://procurenance.<your-account>.workers.dev
```

That `workers.dev` address is supplied by Cloudflare, so you do not need to
buy or configure a domain. Serving the UI and API together keeps the secure
login cookie first-party and removes the old `localhost:5173` →
`localhost:3000` production split.

## What the deployment needs

The application still uses MySQL through Sequelize. Cloudflare does not host
MySQL, so a full deployment needs a publicly reachable MySQL 8 provider and
Cloudflare Hyperdrive to connect to it. Your computer's `localhost` database
cannot be used: Cloudflare must be able to reach the database itself.

The Worker uses a small Cloudflare D1 database only for durable Express
sessions. Worker memory is ephemeral, so the existing in-memory session store
would otherwise log users out whenever a request reached a different isolate.

The supplied [wrangler.jsonc](wrangler.jsonc) deliberately has two placeholder
resource IDs. They must be filled in during the one-time account setup below;
do not commit a MySQL connection string, production password, or API token.

## One-time setup

1. Create a Cloudflare account and enable your free `workers.dev` subdomain
   when the dashboard prompts you. This gives you the public URL above.
2. Prepare an external MySQL database and import only the data you are
   authorized to deploy. The backup files in this repository can contain demo
   accounts and procurement records; do not publish them blindly.
3. Sign into Cloudflare from the repository root:

   ```powershell
   npm exec --prefix municipal_backend wrangler -- login
   ```

4. Create the session database. Copy the `database_id` printed by Wrangler
   into the `SESSIONS.database_id` value in `wrangler.jsonc`, replacing
   `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

   ```powershell
   npm exec --prefix municipal_backend wrangler -- d1 create procurenance-sessions
   npm exec --prefix municipal_backend wrangler -- d1 execute procurenance-sessions --remote --file .\cloudflare\d1\sessions.sql
   ```

5. Create a Hyperdrive connection using the connection string your MySQL
   provider issued. Do not paste a real connection string into source control.
   Copy the returned ID into `HYPERDRIVE.id` in `wrangler.jsonc`, replacing
   `REPLACE_WITH_YOUR_HYPERDRIVE_ID`.

   ```powershell
   npm exec --prefix municipal_backend wrangler -- hyperdrive create procurenance-mysql --connection-string "mysql://USER:PASSWORD@HOST:3306/DATABASE" --caching-disabled
   ```

6. Add long random production secrets. Each command securely prompts for the
   value; generate 32 random bytes for each value, for example with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

   ```powershell
   npm exec --prefix municipal_backend wrangler -- secret put SESSION_SECRET
   npm exec --prefix municipal_backend wrangler -- secret put MFA_ENCRYPTION_KEY
   ```

7. Production requires working invitation, reset, and notification mail. Enter a
   transactional SMTP service that accepts authenticated submission on port 465
   or 587. Add its values as Worker secrets:

   ```powershell
   npm exec --prefix municipal_backend wrangler -- secret put SMTP_HOST
   npm exec --prefix municipal_backend wrangler -- secret put SMTP_PORT
   npm exec --prefix municipal_backend wrangler -- secret put SMTP_SECURE
   npm exec --prefix municipal_backend wrangler -- secret put SMTP_USER
   npm exec --prefix municipal_backend wrangler -- secret put SMTP_PASSWORD
   npm exec --prefix municipal_backend wrangler -- secret put MAIL_FROM_NAME
   npm exec --prefix municipal_backend wrangler -- secret put MAIL_FROM_ADDRESS
   ```

## Build and deploy

Read `SECURITY_AUDIT.md` before release. Build checks alone do not approve government production use.
Apply `cloudflare/d1/sessions.sql` even if you created the sessions database before
the security audit: it now also creates shared `rate_limits` counters. For an
existing Hyperdrive connection, turn off query caching in its configuration.
Authorization and financial state must not use cached database reads.

Set `FRONTEND_ORIGIN` to the exact HTTPS production origin, without a path or
trailing slash, using `wrangler secret put FRONTEND_ORIGIN` or a Worker variable.
Production startup refuses missing/weak session and MFA keys, missing SMTP, or an
invalid origin. Use different random session and MFA keys. Existing MFA records
encrypted with the session key need a planned key migration or re-enrollment.
Do not run the demo seed scripts against production; provision real accounts in
a clean database. Keep the MySQL application account separate from schema-admin
credentials, use verified database TLS/private connectivity, and test restore.

The backend package already contains the Cloudflare worker dependencies. From
the repository root, run:

```powershell
npm ci --prefix municipal-frontend
npm ci --prefix municipal_backend
npm run cf:deploy --prefix municipal_backend
```

Open the `workers.dev` URL printed by the final command. The React SPA is
configured to call `/api`, and the Worker handles `/api/*` before static asset
routing. Cloudflare serves all other routes from the optimized frontend build,
including direct SPA navigation.

The existing security scan runs every 30 minutes through a Cloudflare Cron
Trigger, rather than a Node process-local `setInterval`. PDF rendering uses
Cloudflare Browser Run instead of a Chrome executable installed on a server.

For a remote development check after inserting the two resource IDs, run:

```powershell
npm run cf:dev --prefix municipal_backend
```

## Free-plan boundary

The current Workers Free allowances include 100,000 Worker requests/day, 10 ms
CPU time per request, 100,000 Hyperdrive database queries/day, D1 with 5 GB
storage, and Browser Run for 10 minutes/day. That makes this setup useful for
a demo or small pilot. It is **not** an appropriate budget or reliability tier
for real municipal procurement: password hashing and PDF generation are
intentionally expensive and may exceed the 10 ms CPU allowance under regular
use. Do not reduce bcrypt's work factor or disable MFA to fit the free limit.

Before using the app for live procurement, move to the Workers Paid plan and
establish a managed-MySQL backup, retention, access-control, and recovery plan.
