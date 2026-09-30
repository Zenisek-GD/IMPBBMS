# Budget logic update

The existing **Budget Preparation** workflow remains the path for annual and supplemental budgets. The **Allocations & Transfers** page at `/budget/controls` handles documented project allocations, financial closeouts, transfers, appropriation corrections/migrations and eligible reenactment requests.

## Officer workflow

1. Prepare and approve the annual budget through the existing office proposal, review, ordinance and release stages.
2. Link the final approved APP project to its enacted appropriation. The APP amount is a procurement plan, not a reservation of funds.
3. The Budget Officer prepares an allocation request, records the reason and authority, attaches supporting documents and submits it. A different authorized approving officer reviews and approves it. PR certification and obligation require the project's active approved allocation.
4. Record obligations and supplier invoices/payments through the existing financial workflow. Reports distinguish gross expenses, supplier net payments, tax withholdings, retention, unpaid obligations and funds still available.
5. After procurement is resolved, reconcile final accounts and submit a financial closeout. Classify the full uncommitted balance; retain liabilities separately. Contract savings require completed contract accounts. An unused appropriation requires explicit reuse authority before it becomes transferable.
6. Prepare a separate transfer request from approved reusable funds to an active project allocation. Attach the specific authority. Independent approval checks the available source balance and the destination plan ceiling, applies both sides atomically and permanently records the before/after balances.

Transfers in this workflow require the same fiscal year, fund, expense class, office and verified development sector. Other changes require the applicable budget ordinance process. Reading a notification does not complete a pending approval.

## Requirement coverage

| Requested items | Implementation |
| --- | --- |
| 1–3 | Existing annual budget stages remain authoritative. Direct appropriation records stay drafts. Enacted corrections, migrations and reenactment require evidence and independent approval. Reenacted authority is reconciled when the annual ordinance replaces it. |
| 4–9 | Shared centavo calculations and appropriation ledger distinguish APP plans, allocations, obligations, gross expenditure, net supplier payments, deductions, unpaid amounts and remaining funds. An approved allocation reserves its exact appropriation. |
| 10–11 | Financial closeout checks procurement and invoices, records a balance classification, preserves liabilities and requires approval before reuse. Unused APP/contract differences are never automatically reported as savings. |
| 12–15 | Transfer records retain source/destination projects and appropriations, fiscal year, category/fund, reason, requester/approver, dates, authority, supporting evidence and before/after balances. Transaction locks prevent concurrent overspending. |
| 16 | Financial views and exports use the funding appropriation's fiscal year, including prior-year obligations paid later. Combining years requires an explicit all-years selection. |
| 17–21 | The notification bell, sidebar counts and action screen share one permission-filtered task snapshot and fiscal-year selection. Tasks include planning, budget approvals, bidding failures/rebids, negotiated procurement and publication, with responsible roles and urgency. |
| 22 | Session-expiry warning remains visible before logout. Account-scoped browser recovery preserves supported unfinished planning, budget, invoice and procurement forms, including a final flush before session clearing. Successful saves clear recovery copies. |

## Financial definitions and limits

- Gross expenses are released voucher gross amounts. Supplier net payments and each recorded deduction remain separate. Submitted/certified invoices and unpaid obligations also remain visible; they are not counted as released spending.
- Approved savings and approved available-for-transfer are different: the latter decreases as transfers consume approved reusable balances.
- Tax withholding and retention remain recorded liabilities. This update does not invent a tax remittance or retention-release record when no settlement evidence exists.
- Browser recovery is local to the same account and browser, expires after seven days, and depends on available browser storage. It does not upload attachments or submit a municipal record. The form reports when recovery storage is unavailable.
- Existing historical records are retained. A project with legacy obligations still reserves funds; its next financial actions may require a documented allocation or correction to satisfy the new controls.

## Verification

Regression coverage is in `municipal_backend/tests/budgetGovernance.integration.test.mjs`, `financialConsistency.integration.test.mjs`, `actionQueue.test.mjs`, `budgetControls.browser.mjs` and `actionQueue.browser.mjs`, alongside the planning, requisition, payment and procurement tests. Database tests create isolated temporary schemas on the test MySQL instance. Browser tests render the production build against fixture APIs and do not mutate municipal records.

Validated on 28 September 2026:

- Full frontend ESLint and production build passed. Vite retains its nonblocking bundle-size warning.
- The comprehensive sequential backend run completed 216 checks: 213 initially passed. The three failures were outdated fixtures (permission-based route parsing and records missing funding-year links); all affected tests passed after correction. The fixture assertions for permission scope, invoice paging, bid security and audit atomicity were retained.
- Six additional financial-list tests passed, covering default/current year, explicit all-years, department restrictions, pagination and appropriation-year serialization. Both navigation tests passed.
- Six browser scenarios passed: budget request recovery/evidence/independent approval, shared task counts and session recovery, authentication expiry, planning/proceeding/invoice corrections, procurement/report screens, and APP/PR fiscal selection with future-year form lookups. A repeated browser batch stalled under low memory; the remaining fiscal scenario passed when run alone.
- The existing municipal database passed `node migrate.js --check`. Budget Officer request and Mayor approval grants were present. Audit verification reported 165 intact entries with no problems. No application-data migration or reseeding was performed for this final update.

Changes remain local and uncommitted on top of partner commit `79ee603`. Existing uncommitted work is preserved.
