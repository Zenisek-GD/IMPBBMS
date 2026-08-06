# RA 12009 conformance & hardening — status

Branch: `hardening-and-conformance` (uncommitted; changes are on disk)
Last updated: 2026-08-06

**Every item from the audit is implemented and verified. 95 automated assertions pass.**

Legal basis: **RA 12009 (New Government Procurement Act)** and its **IRR, 1st Edition as of
30 March 2026**, plus the Local Government Code Book II. RA 9184 and its 2016 IRR are repealed;
the GPM Volume 1 PDF used for the audit is the superseded manual.

---

## The audit, item by item

| # | Audit item | Status |
|---|---|---|
| 1 | Declare RA 12009 throughout | ✅ `SYSTEM_MANUAL.md` §0 states the legal basis; remaining RA 9184 mentions are deliberate historical contrasts |
| 2 | **Mass assignment / signature-chain bypass** | ✅ Fixed, exploit re-run and dead. All 24 controllers swept — only PR and APP had the pattern |
| 2b | Ownership checks on PATCH | ✅ Both endpoints |
| 2c | `totalAmount` written without balance re-check | ✅ Not writable at all now |
| 3 | Indicative PPMP → Indicative APP | ✅ `planCycle` |
| 3 | Revised PPMP → updated Indicative APP | ✅ `updatedIndicativeApp` stage |
| 3 | EPA (Early Procurement Activities) | ✅ Solicitation from the plan line; award blocked until enactment |
| 3 | APP posted / submitted to GPPB by end-January | ✅ `postedAt`, `POST /app-entries/gppb-submission` |
| 3 | Sec. 7.7.2 fields (evaluation criteria, strategy, EPA flag) | ✅ |
| 3 | 4% MOOE contingency lump sum | ✅ `GET /app-entries/contingency` |
| 3 | Mode-of-procurement inconsistency APP ↔ PR | ✅ Threshold check on the APP + reconciliation at determination |
| 4 | **Observers (Sec. 43)** | ✅ Roster, invitations, 5-day notice, attendance, inhibition, confidentiality, reports, 7-day presumption, per-stage coverage |
| 4 | PhilGEPS posting | ✅ Posting periods enforced (7/3 days); reference recorded. *Not* a live PhilGEPS integration |
| 4 | Pre-bid conference enforced | ✅ |
| 4 | Early close of bidding | ✅ Blocked before the advertised deadline |
| 4 | **LCRB / HRRB enforcement** | ✅ `rankBids()`; refuses any bid not top of the ranking |
| 4 | Evaluation model wrong for goods/infra | ✅ Pass/fail for goods & infrastructure; rating only for consulting |
| 4 | BAC quorum | ✅ Majority, never <3, Chair or Vice-Chair presiding; blocks before the Award row |
| 4 | Vice-Chairperson | ✅ Role seeded, routed, navigated |
| 4 | Abstract of Bids | ✅ Respects blind stage; lists observer witnesses |
| 4 | Protest mechanism (Sec. 83–85) | ✅ Both stages, fee schedule, verification, finality ceilings; blocks award |
| 4 | HoPE disapproval of award (Sec. 66) | ✅ Written grounds required, furnished to the BAC |
| 4 | Failure of bidding → Negotiated (Sec. 64) | ✅ Counted; second failure opens Sec. 35.1 |
| 4 | Blacklisting (Sec. 69) | ✅ Order no., grounds, 1yr/2yr term, expiry, lifting |
| 4 | Variation orders / termination / liquidated damages | ✅ 10% cumulative ceiling, security top-up required, forfeiture follows fault; LD now computable via the NTP |
| 4 | Conflict of interest for evaluators | ✅ Positive declaration required before scoring |
| 5 | **Performance security enforced** | ✅ Blocks signing; Sec. 68.4 amounts |
| 5 | Warranty security | ✅ On final acceptance; releases the performance security |
| 5 | `contract.sign` was the BAC Chair's | ✅ Moved to the HoPE (LGC Sec. 22(c)) |
| 6 | LGC Sec. 344 third officer | ✅ `pr.obligate` → Municipal Accountant; new `pendingAccountantObligation` stage |
| 6 | `pr.determineMode` held by the Secretariat | ✅ Moved to Chair / Vice-Chair |
| 6 | Seeded permissions drifted | ✅ Fixed by reseeding; noted in the manual |
| 7 | LGC Sec. 323 reenacted budget | ✅ PS + MOOE only; Capital Outlay excluded |
| 7 | Sec. 325(a) PS cap, 324(b) 20% DF, 324(d) 5% LDRRMF | ✅ Reported at finalisation, onto the budget and the audit trail |
| 7 | Sec. 321 statutory calendar | ✅ `calendarStatusFor()` reports lateness |
| 8 | `observer` → `/purchase-requisitions` 403 | ✅ Routes split; observers keep `/app-entries` |
| 8 | `migrate.js` interactive | ✅ Flag-driven, safe by default, `--force` needs `--yes` |
| 8 | `SYSTEM_MANUAL.md` §3/§12 stale | ✅ Rewritten |

### Deliberately **not** done — declare these as delimitations

- **Live PhilGEPS integration.** Posting periods and the reference are enforced and recorded;
  the system does not call PhilGEPS. There is no public sandbox to integrate against.
- **PMR (semestral Procurement Monitoring Report) and APCPI self-assessment.** Both are
  agency-level reporting exercises to the GPPB rather than transaction workflow.
- **BAC composition rules as a gate.** `services/bacCommittee.js` has
  `compositionWarnings()` for the 5–7 member range, the Chair/Vice-Chair requirement and
  1-year terms, but membership is a designation by the Local Chief Executive made outside the
  system. Blocking every award until the designation is keyed in would stop the municipality
  buying anything.
- **TWG constituted per procurement.** `twgMember` remains a static role.
- **Blind evaluation** is retained. It is *not* an IRR concept — bid opening is public and
  observers sign the Abstract of Bids. Defend it as a deliberate anti-collusion enhancement
  layered on top of the statutory process, or drop it.

---

## Verification — 95 assertions, all passing

| Harness | Assertions | Covers |
|---|---|---|
| `municipal_backend/tests-e2e-conformance.mjs` | 36 | LGC Sec. 323, indicative APP cycle, EPA, observers, protests, Abstract of Bids |
| `municipal_backend/tests-e2e-award.mjs` | 35 | Requisition chain through five officers, pre-bid, posting periods, LCRB, protest gate, Sec. 66, performance security, NTP |
| `municipal_backend/tests-e2e-sanctions.mjs` | 24 | Blacklisting, failure of bidding, variation orders, termination, contingency ceiling, GPPB submission |

Plus: audit hash chain verified intact (92 entries), `seedDemo.js` runs clean, frontend lints
clean and builds, and a nav/route cross-check confirms every sidebar link resolves and is
permitted.

**Run them against a throwaway database, never your working one:**

```bash
DB_NAME=impbbms_scratch node migrate.js --force --yes && DB_NAME=impbbms_scratch node seed.js && DB_NAME=impbbms_scratch node seedDemo.js
```

then start the backend with `DB_NAME=impbbms_scratch PORT=3100 node index.js` and run each
harness with `node tests-e2e-*.mjs`.

---

## Frontend

- **Purchase Requisitions** — the new Accountant obligation stage is wired into the status
  labels, the stage trail, the transition map and the return-permission map. Without this every
  requisition would have stalled at a stage with no button.
- **Observers** (`/observers`) — roster, invitations with a live 5-day notice check and a
  Sec. 43.1 composition indicator, attendance with the confidentiality agreement, and the
  observation report form.
- **Protests** (`/protests`) — the bidder files a request for reconsideration, escalates to a
  protest with the fee and the two sworn certifications, and the BAC or the Mayor records a
  decision. One queue, three actors, controls chosen by permission.
- API clients for performance security, NTP, variation orders, termination, warranty security,
  Abstract of Bids, award disapproval, failure of bidding, plan cycles, contingency and GPPB
  submission.
- `bacViceChairperson` added to routes, navigation and landing; the Accountant given a route
  and sidebar entry; three **pre-existing** dead sidebar links fixed.

### Frontend work still worth doing

The API clients exist and are typed, but these do not yet have their own screens — they are
reachable by API only:

- Variation order / termination / warranty security controls on the Contracts page
- Blacklisting controls on Vendor Verification
- `planCycle` / EPA toggle and the Sec. 7.7.2 fields on the APP entry form
- Abstract of Bids view in the Evaluation workspace
- The Sec. 324/325 limitation findings on the Budget Preparation screen

---

## Environment notes

- MySQL is Laragon's and is **not** a Windows service — start
  `C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqld.exe --datadir=C:\laragon\data\mysql-8.4`
  before backend work.
- Your working `municipal_backend` database schema is **stale** — it predates the planning and
  budget-preparation tables, so `GET /api/app-entries` returns HTTP 500 on it. Fix with
  `node migrate.js --alter`, or rebuild with `--force --yes` followed by the seeds.
- **Sequelize stores dates in UTC.** Raw-SQL fixtures must use `UTC_TIMESTAMP()`, not MySQL's
  `NOW()`, or values land eight hours out from what the application reads back.
