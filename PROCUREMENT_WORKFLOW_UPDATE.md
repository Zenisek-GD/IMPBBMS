# Municipal procurement workflow update

The existing Express/Sequelize and React workflow now connects technical assessment, BAC decisions, procurement attempts, awards and detailed reports. The Decision Support Dashboard remains available.

## Evaluation and committee decisions

- Resolution entry uses a fixed **Resolution No.** prefix. Only newly entered or edited values are normalized; historical values and audit records are retained.
- Submission and opening use complete timestamps. Opening must be strictly later, including when both occur on the same day. RFQ preparation includes the pre-bid conference schedule.
- Consulting uses configurable quality and financial weights. Both are positive, total 100%, and quality exceeds financial. Defaults for new procurements are 75/25, with a configurable passing quality score of 60.
- Quality is the average of submitted technical scores. Financial score is `lowest responsive bid price / bidder price × 100`. Combined score is `quality score × quality weight / 100 + financial score × financial weight / 100`, stored to four decimal places. Only responsive bids enter financial ranking.
- Goods and infrastructure use mandatory compliance findings followed by lowest-price ranking. A mandatory failure excludes the bid; unresolved clarification cannot be finalized as compliant.
- TWG members declare no conflict before preparing assessments. Drafts support findings, recommendations, written justification and attachments. Submitted assessments and supporting files become immutable. BAC reviewers cannot review their own TWG submissions.
- Committee decisions require explicit attendance, valid BAC positions and configured quorum. This covers APP consolidation recommendations, PR mode determination, bidder eligibility decisions, evaluation closure, award recommendations, failure resolutions and negotiated-review decisions.
- Defaults require five signatories: one Chairperson, one Vice-Chairperson and three Members, with a quorum of three and an attending presiding officer. Administrators can change the approved configuration in **Settings → Procurement Settings**.
- HoPE award approval remains separate from BAC recommendation. A recommender cannot approve or reject their own award. Existing notification and contract preparation flows remain available.

## Failure, rebid and negotiated procurement

Each attempt has a separate RFQ and numbered history under its original PR or early-procurement APP project. A rebid preserves previous bids, evaluations, resolutions, evidence and outcomes.

Cancellations retain a completed attempt record; subsequent procurement receives a new attempt number. Failed attempts cannot be relabeled by cancelling them. A disapproved award remains recorded when the BAC submits a fresh recommendation.

The default negotiated-review requirement is two failed attempts. Each failure needs an official reason, BAC resolution with recorded approval, and supporting evidence when configured. The API lists missing requirements. Negotiated procurement requires an eligibility submission, another authorized BAC officer's decision, then a separate action to start the approved process. A rejected review permits a rebid. No ordinary RFQ or PR mode action can bypass this history.

Historical missing evidence can be appended through attempt history. Existing failure reasons and resolutions are retained. Evidence files cannot be deleted through ordinary document actions.

## Settings, pending work and reports

**Settings → Procurement Settings → Applicable Limits** manages category, method, amounts, effective date, status, policy reference and remarks. Effective values are loaded centrally; category-specific values take priority over general values. Existing server defaults remain when no effective override exists. Changes are audited.

Sidebar counts use the current user's permissions and relevant work queues. They refresh after successful actions, navigation, window focus and periodically.

The Reports section has fourteen detailed reports: procurement summary, status, plans, bidding activities, bidder participation, bid evaluation, TWG evaluation, BAC actions and resolutions, failures, rebids, negotiated procurement, awarded contracts, timeline and audit trail. Each supports authorized viewing, applicable filters, search, sorting and pagination. CSV opens in Excel; **Print / PDF** produces a print view with browser Save as PDF support. Exports are limited to 10,000 filtered records with an explicit instruction to narrow oversized reports.

Report projections preserve departmental and supplier scope, private TWG drafts, blind bidder identities and sealed prices. Audit export requires the existing audit export permission.

## Migration and rollout

From `municipal_backend`, after configuring the target MySQL connection and backing it up:

```powershell
npm run migrate:procurement
```

Run during maintenance before starting the updated application. This dedicated migration adds missing workflow columns and new tables, then registers historical attempts. It can be rerun and does not drop or rename existing tables or rewrite past bids, evaluations, awards, resolutions or audit hashes. Existing completed/evaluated procurements retain their prior evaluation outcomes without a retroactive TWG requirement. Missing historical declarations and approvals are not invented. New and active procurements follow the updated rules.

After migration, configure the municipality's approved signatories, quorum and applicable limits, then build the frontend with `npm run build` in `municipal-frontend`.

The target application database was unavailable during implementation. No migration or deployment was performed against existing municipal data. Database verification used an isolated loopback MySQL instance and disposable schemas.

## Verification

```powershell
# Backend pure policy checks; database suites skip unless explicitly enabled.
npm run test:procurement

# Isolated MySQL tests: root with an empty password, loopback only.
# Default test port is 33317. Each suite creates/drops its own random schema.
$env:RUN_PROCUREMENT_DB_TESTS = '1'
$env:PROCUREMENT_TEST_DB_PORT = '33317'
npm run test:procurement

# After the frontend build, with Chrome/Edge installed:
npm run test:procurement:browser
```

Integration coverage includes permission enforcement, mandatory failures, weighted ranking, independent review, quorum, transactional audit rollback, award issuance, two failed attempts and negotiated approval, effective limits, evidence immutability, migration idempotency, existing-record preservation, audit-chain verification and the existing integrity monitor's bulk/decimal regressions. Reports tests exercise all fourteen sources, source permissions, departmental/supplier scope, sealed-value protection and pending counts. Browser checks exercise TWG declaration, BAC attendance, settings, every report route and mobile report containment.
