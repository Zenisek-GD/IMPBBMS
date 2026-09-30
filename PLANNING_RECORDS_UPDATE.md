# Planning and record workflow update

The local changes extend the existing development planning, annual budget preparation, procurement request and payment workflows. The separate Budget Logic request remains unfinished; this update does not claim completion of budget transfers, financial closeout or the other Budget Logic requirements.

## Record history

Development plans, goals, annual priorities, AIP headers and projects, budget proposals and proceedings, APP entries, purchase requisitions, invoices and payments retain the acting user, timestamp and relevant previous/new values. Returns preserve the previous approval history while resetting the current workflow for correction. Deleted draft records retain their audit snapshot.

Shared audit hooks cover mapped business records reached through the application, including bulk changes. Planning, requisition, budget-preparation and payment operations write their detailed audit entries in the same transaction as their records: audit failure rolls those operations back. Legacy operations outside a database transaction are audited by the shared hooks but do not acquire transaction-wide rollback merely by using a hook. Database integrity monitoring remains separate from application audit history.

## Permissions and valid workflow states

- Planning officers can edit draft plans/goals and draft or returned AIPs. Submitted records are frozen for the responsible reviewer. Endorsement, adoption and returns require the permission for the current stage.
- Shared record pages and sidebar links use their API read permissions, so explicitly granted custom roles can reach them. Individual actions continue to require their own permissions and office scope.
- Offices prepare and submit their own APP, PR and budget proposals. Authorized central roles retain their specified cross-office duties. The designated office head can endorse the office's requisitions.
- Annual budget preparation keeps its existing stages. Authorized returns reopen proposals and clear obsolete review milestones. Proceedings can be amended only in editable stages; scheduling and actual completion use separate dates.
- Returned invoices can be corrected by their supplier and resubmitted under the same record. Accounting certification and Treasury release remain separate acts, with status and amount checks inside locked transactions.

## Duplicate and concurrent actions

The browser reuses an action key for identical in-flight submissions. Durable server receipts replay completed requests only after current permission checks and reject changed payloads or a changed authorization scope. Unknown outcomes retain the original key during the active page session, including delayed retries. Database locks and workflow checks independently protect duplicate approvals, obligations, invoice certification and payment release.

Receipt protection applies to configured JSON business actions. Uploaded files and other excluded requests do not gain universal exactly-once delivery from this mechanism. A receipt with an uncertain outcome requires checking the record before attempting a different action; a failed response is not proof that nothing was saved.

## Local database rollout

The additive migration was applied on September 23, 2026 after backup and repeat migration checks on a disposable copy. Verification preserved all **667 original rows across 69 tables**. The application audit chain was intact at **165 entries** when checked on September 27; subsequent normal use can change that count.

The SQL backup and checkpoint evidence remain at:

`C:\Users\Gerald\AppData\Local\Temp\impbbms-planning-rollout-16a5p2ou\database-backup`

`node migrate.js --check` confirms the configured application's schema is ready. The migration also includes additive tables and permission registration from the unfinished Budget Logic work; those additions do not mean that the Budget Logic feature set is complete.

## Verification

The backend regression run passed 180 test cases. Two legacy integrity scripts initially received the wrong test database name; both then passed sequentially against the restored disposable database on port 33317, with zero false integrity findings. No regression test used the live application database.

Coverage includes concurrent requests, current permissions before replay, full audit snapshots, audit-failure rollback, bulk changes, decimal integrity fingerprints, office scope, financial caps, return/correction paths and payment officer separation.

Frontend lint and the production build passed. Three headless Chrome walkthroughs passed: the new Planning/Record forms, the existing procurement screens, and security/session behavior. The new walkthrough verifies custom-role navigation, draft plan/goal changes, returned AIP changes, frozen pending AIPs, office-scoped proposal actions, separate scheduled/actual proceeding dates, and correction of an existing invoice with only one request after repeated clicks. Browser fixtures use mocked API data; real permissions, transactions and persistence are checked separately by the database and HTTP suites. Chrome needed execution outside the sandbox after sandboxed startup timed out.

For the focused regression suites, from `municipal_backend` with the isolated MySQL test instance running:

```powershell
$env:RUN_PROCUREMENT_DB_TESTS = '1'
$env:PROCUREMENT_TEST_DB_PORT = '33317'
node --test --test-concurrency=3 tests/planningRecords.integration.test.mjs tests/planningHttp.integration.test.mjs tests/recordChangeAudit.integration.test.mjs tests/requisitionRecords.integration.test.mjs tests/budgetRecords.integration.test.mjs tests/paymentRecords.integration.test.mjs tests/mutationProtection.test.mjs tests/security.test.mjs
```

These integration suites create and remove their own randomly named test schemas. The legacy `services/integrityMonitor*.test.mjs` scripts instead require an explicitly configured disposable database containing suitable RFQ/vendor/bid fixtures; do not run those scripts against application data.

To repeat the frontend checks, from `municipal_backend`:

```powershell
npm.cmd run lint --prefix ../municipal-frontend
npm.cmd run build --prefix ../municipal-frontend
node --test --test-concurrency=1 tests/planningRecords.browser.mjs tests/authSecurity.browser.test.mjs tests/procurement-ui.browser.mjs
```

An installed Chrome or Edge executable must be allowed to start. Set `CHROME_PATH` if it is outside the test scripts' standard locations.

Changes remain uncommitted. No push or remote deployment was performed.
