# Security audit and remediation record

Assessment date: 5 September 2026. Target: React/Vite frontend, Express/Sequelize/MySQL backend, and the proposed Cloudflare Worker/D1/Hyperdrive deployment.

**Release decision: do not use this build for government production records yet.** This review found and repaired exploitable application weaknesses. It does not establish that every workflow is secure, and several release requirements below still need implementation or verification. No deployment was performed.

## Scope and method

- Inspected authentication, authorization middleware, route registration, MFA, account activation/recovery, uploads, document rendering, public disclosure, financial operations, audit/integrity services, environment loading, and Cloudflare configuration.
- Searched backend controllers/models/services and frontend code for raw SQL, unsafe HTML sinks, unfiltered request assignments, browser storage, redirect/URL handling, and permission/ownership checks. The raw SQL literals inspected were static strings, not interpolations of request input. This is not a claim that all SQL/data-access behavior was penetration tested.
- Queried the npm advisory service for both lockfiles, installed security updates, and checked the resulting Worker bundle.
- Added isolated HTTP, parser, SQLite SQL, and model-stub regression tests. Model stubs verify application branches and required conditional updates; they do not prove MySQL transaction isolation or Cloudflare runtime behavior.
- Checked local environment configuration using booleans only. No secret values were printed or changed. Exact configured secret values were checked against the frontend build; none were found. This narrow check is not a complete historical secret scan.
- Preserved deployment work that was already present in the working tree. Removed three SQL backups from Git tracking while preserving all three local files. No Git history was rewritten.

## Remediated findings

| Severity | Finding and previous impact | Change | Main files |
| --- | --- | --- | --- |
| High | The custom HTML parser inserted unescaped `src` and `style` attribute values. Single-quoted input containing double quotes could create event handlers. CSS escapes/entities could evade resource filtering. | Replaced HTML parsing/serialization with `sanitize-html`, restricted CSS and image data URIs, blocked stylesheet escapes, and sanitized stored template/announcement HTML when returned to the UI. | `services/htmlSanitizer.js`, `services/templateRenderer.js`, template/announcement/public controllers |
| High | Protected cookie-authenticated mutations lacked an explicit CSRF defense. | Require a non-simple request header for all writes and reject nonmatching Origin / cross-site Fetch Metadata. Frontend sets the header; CORS only grants the configured origin. Anonymous login, recovery and upload writes are included. | `middleware/securityMiddleware.js`, `index.js`, frontend `src/api/client.js` |
| High | Rate limits existed only inside one process/isolate and could reset or diverge across Workers. Successful password checks also cleared the login budget. | Atomic D1 counters shared across isolates; hashed identifiers; IP and account login budgets; general API budget; expiry/cleanup; store errors do not permit requests. Forwarded IP chains are overwritten at Worker ingress. | `middleware/rateLimitMiddleware.js`, `cloudflare-worker.js`, `cloudflare/d1/sessions.sql` |
| High | Production could continue with a missing session secret, console email, and no independent MFA encryption key. | Fail production startup for invalid/missing secrets, missing SMTP, invalid HTTPS UI origin, or an unsupported volatile standalone session store. | `config/security.js`, `index.js`, `services/mailer.js` |
| High | MFA enforcement trusted a session flag; disabling/resetting enrollment could leave old sessions authorized. A pending MFA login did not recheck account status/password changes. | Read enrollment state on protected requests, bind verification to the enrollment ID, protect account-management writes, and invalidate pending challenges after credential/account changes. | MFA middleware/controller and auth controller |
| High | OTP verification, recovery-code consumption and ticket use had read-then-write races. | OTP and TOTP verification serialize on database row locks. Recovery codes, tickets and activation tokens use conditional consumption. Enrollment confirmation refuses a changed/replaced secret. Outstanding mailbox proofs are voided on password/email changes. | `services/otp.js`, `services/activation.js`, MFA controller, user model |
| High | Password/session invalidation used a two-second grace window; credential/role changes could leave sessions trusted. | Bind sessions to a hash of current credential/account/role/department state and enforce an absolute session age. Existing sessions without the new stamp must sign in again. | `middleware/permissionMiddleware.js`, auth/MFA controllers |
| High | A supplier could report a delivery against another supplier's contract. | Require contract ownership unless the caller holds the internal delivery-reporting permission. | `controllers/contractController.js` |
| High | Raw bid attachments bypassed sealed/blind disclosure; suppliers could replace attachments after submitting bids. | Withhold raw attachments from reviewers until financial disclosure and evaluation closure. Refuse supplier changes after submission. Mask bid identity before evaluation closure and suppress free-text bid remarks in blind responses. | document and bidding controllers |
| High | Contract attachments were automatically public, although suppliers/internal staff could upload them without a publication decision. Public timelines returned internal audit prose and remarks. | Remove raw contract uploads from the public attachment scope; reviewed generated documents retain their explicit approval/publication path. Public timeline entries use action labels and omit internal free-text notes. | `controllers/publicProjectController.js` |
| High | Concurrent invoices/certifications/releases could pass stale state and amount checks. | Lock parent contracts when inserting invoices, recheck duplicate/aggregate billing, lock invoices before certification/return, and recheck payment and running contract totals under locks before release. | `controllers/paymentController.js` |
| High | Tracked SQL database backups could distribute account and municipal data with the source. | Untracked the three dumps without deleting local files; added ignore rules for dumps, environment secrets and Wrangler state. Old commits still require separate review. | `.gitignore`, Git index |
| Medium | API responses lacked general cache/security headers; production logout cleared the old cookie name. | Add no-store, nosniff, framing/referrer controls, production HSTS and a `__Host-` session cookie; clear the correct cookie on logout. Static frontend assets have a separate Cloudflare `_headers` policy. | API security middleware, frontend `public/_headers`, auth controller |
| Medium | Forgotten-password responses differed structurally for known/unknown accounts and on account cooldown. | Return matching challenge shapes and generic verification errors, including dummy references. Login now performs a cost-12 bcrypt check for absent accounts. SMTP timing differences remain an open item below. | auth/password reset controllers |
| Medium | Passwords longer than bcrypt's 72-byte limit silently lost entropy. | New passwords require at least 12 characters and at most 72 UTF-8 bytes; frontend matches. Existing passwords can still authenticate. | password validator, frontend validation and hints |
| Medium | Upload validation trusted MIME and extension alone; multipart field counts were unbounded. | Validate PDF/PNG/JPEG signatures and bound multipart fields/parts. Office formats are refused pending a scanning/quarantine design. Downloads remain attachments with a restrictive CSP. | document store/controller, frontend document API |
| Medium | Local Chromium was started without its sandbox and JavaScript remained enabled for PDF rendering. | Keep the Chromium sandbox and explicitly disable JavaScript; retain outbound-request blocking. | `services/pdfRenderer.js` |
| Medium | Audit CSV cells could be interpreted as formulas; application errors logged token-bearing query strings and raw DB messages. | Neutralize spreadsheet formula prefixes and log method/path/error class rather than queries or database messages. | audit controller, error middleware |
| Medium | Record fingerprints were written outside the transaction whose data they described. | Pass the originating transaction through per-row and bulk fingerprint hooks. Broader audit durability remains open. | `services/integrityMonitor.js` |
| Medium | Demo seeding and a helper that exposes authenticator codes had no production guard. | Require explicit development mode and prohibit Worker execution. Existing demo accounts still need removal before production. | `config/developmentOnly.js`, seed scripts, demo helper |

The classification above describes code-level impact, not a formal CVSS assessment.

## Dependency decisions

Initial npm results: backend **8 reported vulnerable packages** (3 high, 5 moderate); frontend **2 high**. These counts include transitive effects, so they are not ten independent application exploits.

After remediation, npm reported **0 vulnerabilities** for each installed dependency tree. Re-run advisories at release time; a clean registry scan does not detect unknown vulnerabilities or unsafe application logic.

- Added a pinned `sanitize-html` dependency for server-side HTML parsing.
- Updated frontend lockfile dependencies to resolve `fast-uri` and `nanoid` advisories.
- Pinned `qs` 6.16.0 and Sequelize's `uuid` dependency to 11.1.1. Inspected Sequelize's usage: UUID v1/v4 generation is retained. Database-backed regression checks are still required.
- Overrode Cloudflare Puppeteer's obsolete `@puppeteer/browsers` 2.2.4 helper with 3.2.2 to remove the vulnerable `extract-zip` dependency. The app imports the Cloudflare Worker entry point (`PuppeteerWorkers`), not its Node browser installer. This is an explicit cross-major dependency override: bundle checks pass, but **a real Cloudflare Browser Run PDF test remains required**. Do not use the fork's Node installer/launcher paths without testing their compatibility separately.
- `npm run security:check` runs the regression suite, both advisory scans and frontend lint. `cf:deploy` now runs these checks before building/publishing. These checks are not a government release approval gate and do not automatically validate the open operational requirements.

## Open release requirements

1. **Database-backed validation — blocking.** The MySQL connection in `.env` returned `ECONNREFUSED`. No seed, schema change, financial test or integrity test was run against that database. Use a disposable database to test parallel OTP/TOTP guesses, recovery reuse, invoice insertion, voucher creation/release, rollbacks, every role/department boundary, and full procurement/award/contract/payment workflows. Existing E2E scripts create/mutate records and must not target production data.
2. **Audit durability and independent custody — blocking for government financial use.** `services/auditLog.js` still writes audit events separately from many business transactions and catches write failures. Its in-process queue is not a distributed queue; latest-row locking/unique sequence constraints need concurrency testing, particularly empty-chain initialization and deadlock/retry behavior. A business write can commit without its audit event. Use a transactional audit/outbox design with database-level serialization, retry handling and an independently retained audit destination. A hash chain stored in the same database is not protection against an administrator who can rewrite both records and hashes. This was identified, not represented as fixed by adding headers.
3. **Cloudflare integration — blocking.** Replace placeholder binding IDs, apply the D1 schema (including the new `rate_limits` table), configure the exact HTTPS `FRONTEND_ORIGIN`, install separate production secrets, and verify runtime startup, cookies, shared rate limits, cron cleanup, SMTP/TLS, and Browser Run PDFs in staging. A dry-run bundles code; it does not execute these integrations. Disable Hyperdrive query caching for authorization/financial reads; stale SELECTs can defeat immediate revocation and state checks.
4. **Data/credential cleanup — blocking if old material was shared.** SQL backups remain in Git history. Determine whether old commits/remotes/artifacts contained real records, password hashes or secrets, and rotate affected credentials/re-enroll MFA as appropriate. Do not import demo accounts or demo procurement records into production. A default-password seed guard does not deactivate existing accounts. Keep production MySQL separate from development and use a least-privileged application account, not `root`.
5. **MFA key migration.** The local environment lacks an independent MFA key; previous enrollments may be encrypted using the session-secret fallback. Setting a new MFA key will not decrypt those old records. Use a fresh production database or plan/rehearse secure key migration or enrollment reset. Do not simply replace the old key on an existing populated database.
6. **Upload malware defense.** File signatures are not malware scanning. PDFs/images can contain malicious or misleading content, and existing Office uploads remain stored. Add quarantine, scanning/content disarm, retention/storage quotas and review of historical files before accepting real government documents. The narrower upload policy changes accepted formats; arrange a safe scanned-document workflow.
7. **Resource exhaustion and recovery timing.** Several public lists, reports, integrity sweeps and exports load full result sets. The added rate limits/body bounds reduce abuse but do not make large datasets bounded. Implement cursor pagination/streaming and test Worker memory/CPU limits with realistic volumes. Password reset email is synchronous: response latency can still reveal account existence despite matching response shapes. Move mail issuance to a durable queued workflow with uniform external behavior. Resend issuance limits also need parallel-request testing.
8. **Publication and separation-of-duty review.** Re-check existing published notices/documents and free-text record fields for confidential content. Raw bid attachments are deliberately withheld during blind evaluation because they are not redacted; a future electronic-envelope workflow needs separately authorized technical/financial access. Confirm role grants, department isolation, financial transition races outside the invoice/payment fixes, and records-retention/publication rules with the responsible municipal officers.
9. **Independent staging assessment and operations.** Obtain an independent penetration test, exercise backup restoration and incident response, configure administrative account protection and alerts, and approve data classification, retention, hosting location/vendor access and access-review procedures. This code review is not a legal/compliance certification.

## Reproduction and validation

From `municipal_backend`:

```powershell
npm.cmd run test:security
node services/totp.test.mjs
npm.cmd audit
```

From `municipal-frontend`:

```powershell
npm.cmd audit
npm.cmd run lint
npm.cmd run build
```

From the repository root (build check only):

```powershell
node municipal_backend/node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir .wrangler-dry-run
```

The isolated tests use Node 22's experimental `node:sqlite` to exercise the D1 counter SQL without touching remote D1. HTTP tests bind ephemeral loopback ports. Model tests stub storage and do not require `.env` or a database. The existing TOTP suite checks 17 RFC/encoding/verification cases.

## Reference guidance

- [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) informed the exact-origin/non-simple-header checks; SameSite alone was not treated as sufficient.
- [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) distinguishes signature/type checks from malware handling and upload access control.
- [Cloudflare static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/) documents the `_headers` file used for the SPA. API responses set their own headers.
- [Cloudflare Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/) documents default caching behavior; disable it for this transactional application.
- [extract-zip advisory](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) explains the removed transitive ZIP extraction risk.
