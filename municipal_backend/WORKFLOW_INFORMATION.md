# Missing workflow information

Applicable business fields accept a blank answer or None / N/A. The UI includes a clear control, and the server normalizes exact unavailable answers to null. False, No and numeric zero remain distinct from an unanswered field. PATCH omissions retain the existing value; an explicit blank clears it.

`services/workflowInformation.js` is the endpoint and field allowlist. It covers development plans and goals, investment programs, budget proposals and proceedings, APP drafts, requisition drafts, solicitations and schedules, contracts, deliveries, invoices, payments, appropriations, budget controls, pending items, conferences, observers, announcement details and template descriptions. Nested budget lines and requisition items are individually identified in the confirmation.

Authorization runs first. An incomplete request returns HTTP 409 with code `INCOMPLETE_INFORMATION_CONFIRMATION_REQUIRED` and `missingFields` before a mutation receipt or business write is made. The frontend lists these fields and awaits Go back or Proceed anyway. Proceed retries the same action key with `X-Confirm-Incomplete-Information: true`. Cancellation performs no business mutation. API clients must also explicitly acknowledge missing information. Confirmed missing fields are included in the new action's audit metadata.

The confirmation only acknowledges missing details; it does not grant permissions, satisfy approval evidence, invent amounts, mark verification checks passed or skip workflow dependencies. Drafts can retain unanswered values supported by their existing controllers. Values needed for a later calculation or approval remain required at that stage. Account creation, vendor onboarding, registration, activation, login, password recovery, profile/security settings and account requirements are outside the allowlist.

All affected database columns already support null. No schema migration or rewrite of existing records is needed. Corrections distinguish clearing a value from leaving it unchanged, including budget justification, supplier invoice reference and pending-item notes. An explicitly unknown delivery date remains null rather than being replaced by today's date.

## Verification

From `municipal_backend`, run `npm run test:workflow-information`. The tests cover normalization, nested missing-field labels, confirmation/cancellation, account exclusion, conditional requirements, action-key reuse and compatibility with the Sequelize column definitions.

Database checks use temporary schemas, never the application database:

```powershell
$env:RUN_PROCUREMENT_DB_TESTS='1'
$env:PROCUREMENT_TEST_DB_PORT='33317'
node --test --test-concurrency=1 tests/planningHttp.integration.test.mjs tests/procurementInformation.integration.test.mjs tests/budgetRecords.integration.test.mjs tests/paymentRecords.integration.test.mjs
```

The HTTP suite verifies that an unconfirmed incomplete request creates neither a record nor an action receipt. The procurement integration suite carries unavailable delivery details through inspection, invoicing and payment while retaining approval controls and verifying audit integrity.
