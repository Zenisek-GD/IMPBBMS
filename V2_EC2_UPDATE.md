# V2 update: local push, EC2 pull, then explicit reset

Pushing or pulling this code does **not** reset a database. Application startup and migrations do not invoke `reset:v2`. Run the reset only on the intended EC2 database during the maintenance window.

## What the reset keeps

- Exactly one existing **active System Administrator**, selected by its email. Its ID, password hash, role, department, MFA enrollment and recovery codes remain.
- Roles, role permissions, authentication policies, departments, procurement modes and configured procurement limits.
- Document templates and their versions, LGU details, branding, navigation, public FAQs, session-duration and procurement-policy settings.
- Categories, funds, expense classes and sectors are supplied by the application code; there is no separate category table to reseed.

All other accounts and operational records are removed: plans, AIP/APP, budgets, allocations, transfers, requests, bidding, suppliers, observer organizations, awards, contracts, payments, documents, announcements, notifications, sessions, trusted devices and old audit/security records. Uploaded documents are database BLOBs and are included in the SQL backup.

Department heads and BAC signatory assignments are cleared. Deleted template authors become unassigned; they are not attributed to the surviving administrator. Workflow locks and old budget replacement references are cleared. Configured template content and procurement limits remain, so review any custom text before reopening.

By default, the administrator's `createdAt` becomes the **actual reset time**. The new reset audit and deployment marker preserve its original timestamp. The reset also records the calendar date in `Asia/Manila`; it does not hardcode September 30. Use `--admin-date preserve` on both preview and apply if the original account date should remain unchanged.

## 1. Push from this computer

From the repository root, inspect the changes before committing:

```powershell
git status --short
git diff --stat
git add municipal_backend municipal-frontend BUDGET_LOGIC_UPDATE.md PLANNING_RECORDS_UPDATE.md V2_EC2_UPDATE.md
git diff --cached --stat
git diff --cached --name-only
git commit -m "Prepare V2 planning, budget controls and EC2 reset"
git push origin main
git rev-parse HEAD
```

Keep `.env`, database dumps and credentials out of the commit. Record the final commit ID for comparison on EC2. If the push is rejected because your partner pushed newer work, fetch and review those commits, merge and verify the combined changes before pushing again. Do not force-push.

## 2. Prepare EC2 and stop application traffic

If you only want to download the latest code first, use the separate-checkout procedure below **before** scheduling downtime. The maintenance steps in this section apply when you are ready to perform the actual update.

The repository does not contain this server's checkout path, service name or Nginx configuration. Use the existing deployment's actual values; do not replace its service configuration blindly.

- Have Node 22.12 or later, npm and a compatible `mysqldump` available. Keep the existing database connection and SMTP settings.
- Preserve the existing `MFA_ENCRYPTION_KEY` and `SESSION_SECRET`. The reset checks that the retained administrator's MFA can still be decrypted. Do not generate replacement keys during this update.
- For standalone EC2, set `NODE_ENV=production` and leave `CLOUDFLARE_WORKER` unset. Production requires separate strong session/MFA keys, SMTP and an exact HTTPS `FRONTEND_ORIGIN` without a trailing slash. Configure `TRUST_PROXY` for the actual reverse proxy; do not trust arbitrary client headers.
- Put the site into maintenance and stop **every backend process, replica and background worker** using the existing process manager or Docker Compose deployment. Keep the database running for backup, migration and reset. Keep application processes stopped through these operations. `--maintenance-confirmed` records the operator's confirmation; the script cannot discover other running servers.
- Preserve a copy of the old backend environment and frontend build, record `git rev-parse HEAD`, and retain your existing EC2/volume/database recovery snapshot. Store backups outside the checkout with restricted access.

## 3. Pull and back up before migrating

### Download V2 first while the existing Docker deployment stays running

For the reported dirty EC2 checkout, this is the recommended first step while the Docker and package changes are still being reviewed. Finish the local commit/push in section 1 first. Then run from the **existing EC2 repository directory**:

```bash
git status --short
git fetch origin
git log -1 --oneline origin/main
```

Confirm `origin/main` contains the V2 commit you just pushed. If fetching fails or the commit is not the expected release, stop and resolve that before proceeding. Create a separate checkout of that fetched commit:

```bash
EC2_V2_DIR="$HOME/IMPBBMS_Capstone-v2-$(date +%Y%m%d-%H%M%S)"
git worktree add --detach "$EC2_V2_DIR" origin/main
cd "$EC2_V2_DIR"
git rev-parse HEAD
git status --short
ls municipal_backend/resetV2.js municipal_backend/backupDatabase.js V2_EC2_UPDATE.md
```

Run each command only after the preceding one succeeds. The commit should match your pushed release and `git status --short` should be empty. Git's detached-HEAD notice is expected for this release checkout.

This downloads and checks out V2 without stashing, overwriting or merging the existing EC2 working files. V1 continues using its original directory. No containers are stopped, and no database migration or reset runs. The new checkout does not include ignored `.env` files or the untracked EC2 Docker files. Do not start a second Compose stack against the same live database. Finish reviewing the original Docker files, package changes and mount paths before choosing the deployment directory and running the maintenance/update steps. Downloading V2 alone does not switch the live application to V2.

### EC2 has local Docker files or modified application code

The reported EC2 checkout contains modified backend `index.js`, `middleware/asyncHandler.js`, `package.json`, both application lockfiles, and untracked `docker-compose.yml`, backend `Dockerfile`/`.dockerignore`, and a root lockfile. These are server changes that must be reviewed before pulling V2.

The two supplied backend snippets have been reviewed. V2 now includes `app.listen(PORT, process.env.LISTEN_HOST || "0.0.0.0", ...)` inside its existing standalone-server guard. Containers can accept connections through their network interface; a directly hosted backend behind a local reverse proxy can instead configure `LISTEN_HOST=127.0.0.1`. V2 already has the supplied 413, 409, 400 and 500 error responses, along with workflow-error and already-sent-response handling. Keep the V2 error handler; the temporary `ACTUAL BACKEND ERROR` full-stack/object logging is not required. Package/dependency and Docker configuration changes still need review before the deployment is considered compatible.

Do **not** run the generic `git stash push -u` step yet: it removes untracked Docker files from the checkout. Do not discard these files or replace V2's backend files wholesale with V1 copies. If containers bind-mount this checkout, changing source files can also change what the running application sees.

First inspect the application edits and Docker entry point without changing files:

```bash
git diff HEAD -- municipal_backend/index.js municipal_backend/middleware/asyncHandler.js municipal_backend/package.json
cat municipal_backend/Dockerfile municipal_backend/.dockerignore
docker compose config --services
```

Redact any hardcoded credentials before sharing output. Do not share the full `docker compose config` output: it can expand environment secrets. Review the Compose file privately for service names, build contexts, bind mounts, database volumes, environment-file paths and startup commands. Keep `.env` values private.

Make a private backup outside the checkout before changing it. From the repository root, these commands preserve the reported files and tracked edits without stashing or stopping anything:

```bash
umask 077
EC2_V1_BACKUP="$(mktemp -d "$HOME/procurenance-v1-files.XXXXXX")"
git rev-parse HEAD > "$EC2_V1_BACKUP/commit.txt"
git diff --binary HEAD > "$EC2_V1_BACKUP/tracked-changes.patch"
cp -- docker-compose.yml municipal_backend/Dockerfile municipal_backend/.dockerignore package-lock.json "$EC2_V1_BACKUP/"
```

Check every command succeeds. This is a code/configuration backup, not a database backup. Preserve the deployment's actual environment files separately without sharing or committing them.

Compare the EC2 source changes with V2 and carry over only the required deployment adjustments. Review dependency changes together with their lockfiles; do not choose a lockfile merely because it came from EC2. After the Docker entry point and Compose mounts are understood, decide which reviewed files belong in the repository and which remain private server configuration, then use the applicable deployment sequence.

**The host Node/npm commands below describe a direct Node deployment.** A Docker deployment needs the same backup/migrate/build/reset sequence executed in the correct image and Compose network. The backend image must contain the V2 scripts, compatible Node and `mysqldump`, and its backup directory must be mounted to persistent host storage outside the checkout. Rebuild images to include source changes; a host `npm ci` does not update an existing image. Do not recreate the application containers until the updated image and database are ready. Do not use `docker compose down -v`: it can delete database volumes. Exact Docker commands depend on the server's files, which are not present in this local checkout.

### Direct Node deployment with reviewed local changes

In the existing EC2 checkout:

```bash
git status --short
git pull --ff-only origin main
git rev-parse HEAD
npm ci --include=dev --prefix municipal_backend
npm ci --include=dev --prefix municipal-frontend
```

The commit ID must match the one you pushed. If local EC2 changes prevent the pull, preserve and review them; do not use `git reset --hard` to bypass the problem.

Choose an absolute backup directory outside the checkout. The examples use `$HOME/procurenance-backups`. Run each next step only after the previous one succeeds:

```bash
cd municipal_backend
npm run backup:database -- --backup-directory "$HOME/procurenance-backups"
```

Save the reported file path and SHA256 as the **pre-migration backup**. It includes schema, records, BLOBs, routines, triggers and events. Credentials are passed privately to the dump process, not in command arguments. If backup fails, stop here. Verify restoration into a separate temporary database/server before relying on it for rollback; the automatic checks confirm successful dump creation, not a restore rehearsal. The dump includes `CREATE DATABASE`/`USE`, so never rehearse it against the live database server under a different assumed target name.

## 4. Migrate, build and preview the reset

```bash
npm run migrate
npm run migrate -- --check
npm run build --prefix ../municipal-frontend
npm run reset:v2 -- --admin-email 'YOUR_EXISTING_ADMIN_EMAIL'
```

Replace `YOUR_EXISTING_ADMIN_EMAIL` with the account to keep. Check the printed database host, port, name, administrator and per-table keep/remove counts. Preview does not change any records. Unknown tables, missing model columns, nontransactional tables, triggers, cross-database foreign keys or an incompatible MFA key stop the reset for review.

The ordinary migration creates the V2 tables, including project allocations, budget controls, mutation receipts and the shared EC2 rate-limit store. It also updates the planning goal sector enum. If migration or schema checks fail, keep maintenance in place and resolve the reported difference. Do not run `migrate --force`, the demonstration seeds or `reset:workflow` on EC2. A schema check verifies tables and columns, not every possible historical schema difference.

## 5. Apply the reset once

Only after reviewing the preview, replace both placeholders below:

```bash
npm run reset:v2 -- --admin-email 'YOUR_EXISTING_ADMIN_EMAIL' --apply --confirm-database 'EXACT_DB_NAME' --maintenance-confirmed --backup-directory "$HOME/procurenance-backups"
```

The command creates a second, post-migration SQL backup before deleting anything. It verifies completion, size and SHA256, then performs the reset in one InnoDB transaction with foreign-key checks enabled. A failure rolls back database deletions, timestamp changes and the new audit entry. Auto-increment counters are not reset. A completed V2 marker prevents a repeated command from erasing newly entered V2 data.

Keep both backup files. The pre-migration backup goes with the old release for rollback; the post-migration backup contains the former data with the new schema. The old audit history remains in those protected archives. The live database starts with an audit record identifying the CLI reset, the preserved account's original date, table counts and backup reference.

## 6. Restart and verify before reopening

Restart the existing backend service with `municipal_backend` as its working directory so it reads the correct `.env`. Serve the rebuilt `municipal-frontend/dist` through the existing web server; Express is the API, not the Vite production server. The default frontend uses `/api`, which must route to the backend on the same HTTPS origin. Keep the existing Chrome/Chromium setup used for PDF generation.

Verify administrator login and MFA, the requested account date, a single remaining user, retained roles/departments/templates/settings, empty operational lists and the new `system.v2.reset` audit entry. Run the system's security/integrity scan and check service logs. Confirm no deleted account or old browser session can sign in. Clear old browser draft recovery data before entering V2 records.

Create the new office accounts, assign department heads and BAC signatories, and configure any required observer organizations. A fresh database cannot advance workflows until those responsible people exist. Reopen the site after these checks.

## Rollback

Keep maintenance enabled and stop all application processes. Restore the **pre-migration** SQL backup to its original database using the existing DBA restore procedure, restore the previous code/build and the matching environment, then verify login and data before reopening. The dumps name their source database; inspect the target before restoring. Changing only the code does not undo a reset. Do not rerun demo seeding to recover production records.

## Verification performed locally

On September 30, 2026: 32 focused security, backup and migration checks passed; the isolated MySQL reset suite passed 10 checks; shared rate limits passed a separate concurrency/restart test; and the real CLI migration/preview/backup/reset/restore test passed with binary document contents restored correctly. Tests used temporary schemas on a separate MySQL test instance. No application database reset or EC2 deployment was performed.
