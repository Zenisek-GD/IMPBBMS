# Municipal procurement workflow update

The local checkout includes the procurement and bidding improvements on top of upstream commit `6f6c049`. The existing React, Express and Sequelize application now connects approved schedules, category-specific evaluation, committee decisions, permanent procurement attempts and audit history.

## Evaluation

| Procurement category | Evaluation and ranking |
| --- | --- |
| Goods | Mandatory compliance checklist, pass/fail findings and responsive lowest-price ranking |
| Infrastructure | Mandatory compliance checklist, pass/fail findings and responsive lowest-price ranking |
| Consulting services | Independently approved technical criteria, quality threshold, quality/price weights and weighted ranking |

Consulting criteria must be approved before publication. Quality and price weights are positive, total 100%, and quality exceeds price. Approved criteria are read-only during evaluation. A documented criteria amendment requires independent approval and is blocked after bids have been received.

Financial score is `lowest responsive bid price / bidder price * 100`; the combined score applies the approved quality and price weights. Only responsive bids enter financial ranking. Goods and infrastructure cannot submit consulting-style numeric scores. Failed compliance findings require a reason, explanation and recommendation.

Each evaluator records their own conflict-of-interest declaration. A conflict excludes that evaluator's contribution and creates reassignment work. Users cannot declare on another evaluator's behalf. TWG submissions require declarations and independent BAC review.

Submitted evaluations and TWG assessments are locked. Authorized returns require a reason and retain the previous submission. Replacement submissions, return history and supporting documents remain available; returned or superseded evaluations do not count toward closure or award ranking.

## Failure, rebid and negotiated procurement

Failure of Bidding follows preparation, submission, BAC review, attendance validation, individual committee decisions and authorized finalization. The Secretariat prepares documents; the presiding BAC officer finalizes only when recorded personal decisions meet configured quorum and participation requirements. Each member must record their own decision. Submission of failure documents does not itself declare a procurement failed.

Permanent failure records include their number, procurement attempt, category, explanation, responsible officials, recommendations, resolution, evidence, next action and approval metadata. Rejected proposals and prior failures remain in history. Pending BAC failure review blocks conflicting evaluation, post-qualification, award and cancellation actions.

The first approved failure permits a rebid. A new attempt retains the original PR or early-procurement APP link while preserving the previous attempt's schedule, bids, evaluations, resolutions and evidence. Failed attempts cannot be relabeled through cancellation.

Negotiated Procurement requires the configured failed-attempt count (default two), official approved failure records, a complete eligibility checklist and a separate BAC review. The configurable document checklist supports revised specifications or scope, updated costs, market and price references, end-user justification, resolutions and other required approvals. Missing requirements are shown explicitly. Each participating BAC member records a personal decision, and starting the approved negotiated attempt remains a separate authorized action.

Legacy missing failure evidence can be appended through the governed review process. Original failure details remain intact, and ordinary document deletion cannot remove permanent procurement evidence.

## Authoritative schedules and announcements

Each procurement attempt stores the authoritative publication, pre-bid, submission, opening, evaluation, post-qualification and expected award dates. The full-page Schedule / Criteria workspace supports preparation and independent BAC schedule approval before publication.

Pre-bid conferences are optional. When required, a date, time and venue or online meeting details are mandatory, and the conference must precede the submission deadline. Opening must be strictly after the deadline, including on the same day. All supplied milestones are checked for a valid sequence.

Linked public announcements, invitations, conferences, dashboard deadlines and reports consume these dates. Bidding-date fields cannot be published on an unlinked notice, even if it is classified as a general announcement. Archived announcements and completed conference dates retain their historical values.

Published schedules require a formal amendment with previous and proposed values, a reason, supporting uploaded evidence and independent approval. Approval revalidates the current schedule and commits schedule, public projections and audit records together. Stale amendments, reopening a closed submission period and rewriting completed opening dates are rejected.

Bid submission enforces the exact approved deadline. A periodic service also closes expired submission periods and records deadline and closure events. Bid creation, security details, verification-ticket consumption and the audit event commit atomically, including under concurrent duplicate requests.

## Roles, next actions and reporting

BAC chair and vice-chair navigation includes Procurement Approvals; members can access BAC Decisions. The Secretariat retains preparation and publication duties. Status-dependent actions and dashboard tasks reflect permissions, personal committee decisions, approvals and outstanding prerequisites. Backend checks enforce the same rules.

Procurement Settings manages signatories, quorum, applicable limits and the negotiated-document checklist. Defaults use five signatories (chair, vice-chair and three members), quorum three and an attending presiding officer. HoPE award approval remains separate from BAC recommendation.

The existing detailed reports, exports and Decision Support Dashboard remain available. Evaluation reports include submission state, declarations and failure reasons. Timelines include approvals, amendments, failures, rebids and negotiated review. Report permissions retain department and supplier scope, private TWG drafts, blinded bidder identities and sealed prices.

## Local database migration

The configured local database was backed up before migration. The backup was first restored to an isolated loopback MySQL instance, where the additive migration was applied twice to verify repeatability and preservation.

The migration was then applied successfully to the local application database on September 14, 2026. Verification matched all 655 original rows across 68 tables against the pre-migration checkpoint. The audit chain was intact at 160 entries, and `node migrate.js --check` reported the schema up to date. These counts describe the migration checkpoint; ordinary subsequent application activity may add records.

The SQL backup, original-record checkpoint and verification results are retained at:

`C:\Users\Gerald\AppData\Local\Temp\impbbms-procurement-backup-1789381757946`

No remote deployment or Git push was performed.

For another installation, back up its configured database and run from `municipal_backend` before starting the updated application:

```powershell
npm.cmd run migrate:procurement
node migrate.js --check
```

The migration adds missing columns and tables and registers historical attempts. It does not drop or rename existing tables or fabricate historical declarations or approvals. Existing completed/evaluated procurements retain their outcomes. Missing prerequisites on active legacy records must be completed through the authorized workflow.

## Verification

The final complete backend regression run passed 109 tests with zero failures or skips, including database integration and the authentication browser test.

Frontend lint, the production build and the procurement browser walkthrough passed. The walkthrough covers consulting criteria, goods/infrastructure compliance failures, personal declarations, schedule approval permissions, failure preparation versus BAC action, report routes and mobile containment.

Backend integration coverage includes permissions, immutable evaluation corrections, conflict exclusions, committee quorum and personal voting, failure review locks, two-failure negotiated eligibility, schedule amendment rollback and synchronization, direct and scheduled announcement validation, atomic bids and verification tickets, deadline closure, migration repeatability, record preservation, audit-chain integrity and scoped reports.

Run procurement policy checks from `municipal_backend` (database suites skip unless explicitly enabled):

```powershell
npm.cmd run test:procurement
```

For an isolated MySQL instance with a loopback-only root account and empty password:

```powershell
$env:RUN_PROCUREMENT_DB_TESTS = '1'
$env:PROCUREMENT_TEST_DB_PORT = '33317'
npm.cmd run test:procurement
```

Each database suite creates and removes only its own randomly named test schema. Build the frontend before browser checks:

```powershell
npm.cmd run build --prefix ../municipal-frontend
npm.cmd run test:procurement:browser
```

Chrome/Edge must be permitted to start in the test environment. Browser-test cleanup now closes the fixture server even if browser startup fails.
