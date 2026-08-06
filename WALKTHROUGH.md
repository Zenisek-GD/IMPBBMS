# IMPBBMS — hands-on walkthrough

Every account below uses the password **`Passw0rd!`**

---

## 0. Start the system

**Start MySQL first.** Laragon's MySQL is not a Windows service, so it has to be started by hand:

```bash
"C:/laragon/bin/mysql/mysql-8.4.3-winx64/bin/mysqld.exe" --datadir="C:/laragon/data/mysql-8.4" --console
```

Leave that window open. Then, in a second terminal:

```bash
cd municipal_backend && node migrate.js --force --yes && npm run seed && npm run seed:demo
```

> ⚠️ `--force` **drops every table** in `municipal_backend`. That is what you want here — your
> current database has a stale schema (it predates the planning and budget tables, so
> `/app-entries` returns a 500 on it). If you would rather keep your existing rows, run
> `node migrate.js --alter` instead and skip the seeds.

Then start the two servers, each in its own terminal:

```bash
cd municipal_backend && npm run xian
```

```bash
cd municipal-frontend && npm run dev
```

Open **http://localhost:5173**. You land on the **public transparency portal** — no login. That
is deliberate: the procurement record is the front door, not a login form. Sign in from the
three-dot menu at the top right.

---

## 1. The accounts

| Role | Email (`@civicbid.test`) | Office | What they do |
|---|---|---|---|
| System Administrator | `systemadministrator` | IT | Users, departments, settings, bidder accounts |
| **Mayor (HoPE)** | `hope` | Mayor's Office | Priorities, approves budget/APP/PR/awards, signs contracts, decides protests, blacklists |
| Planning Coordinator | `planningofficer` | MPDO | Development plan, AIP, consolidates proposals, Local Finance Committee |
| Sanggunian Secretary | `sangguniansecretary` | SB | Records the ordinance and the provincial review |
| **Head of Office** | `headofoffice` | Engineering | **Endorses** the requisitions their staff prepare |
| **Department Requester** | `departmentrequester` | Engineering | Prepares budget proposals, PPMP lines, requisitions |
| Budget Officer | `budgetofficer` | Budget | Budget calendar, appropriation register, certifies appropriations |
| **Municipal Accountant** | `municipalaccountant` | Accounting | **Obligates** the appropriation (ORS), certifies invoices |
| Municipal Treasurer | `municipaltreasurer` | Treasury | Certifies cash available, releases payments |
| BAC Chairperson | `bacchairperson` | BAC | Determines mode, evaluation, recommends award |
| BAC Vice-Chairperson | `bacvicechairperson` | BAC | Presides when the Chair cannot — the quorum depends on it |
| BAC Member | `bacmember` | BAC | Evaluation, post-qualification |
| BAC Secretariat | `bacsecretariat` | BAC Sec | Consolidates the APP, publishes solicitations, invites observers, drafts contracts |
| TWG Member | `twgmember` | TWG | Technical evaluation input |
| Vendor | `vendor` | — | Bids, signs contracts, invoices, **files protests** |
| Observer | `observer` | — | Sits in on BAC proceedings, files observation reports |
| Internal Auditor | `internalauditor` | Internal Audit | Full audit trail |

---

## Path A — the 10-minute tour (uses the demo data)

`npm run seed:demo` already walked six projects through the lifecycle. Start here to see the
system with data in it.

1. **Public portal** — http://localhost:5173 while logged out. Six projects, filterable by
   completed / ongoing / upcoming. Click one for its full lifecycle timeline, which is read
   from the audit log rather than a fixture.
2. **`internalauditor`** → *Audit Trail*. Every decision, with the officer and a hash chain.
   This is the same data the public timeline renders.
3. **`hope`** → *Executive Insights*, then *Budget Utilisation* — what was appropriated against
   what has actually been obligated and paid.
4. **`budgetofficer`** → *Appropriations*. The ordinance lines everything else is measured
   against.

---

## Path B — run the full chain yourself

This is the real walkthrough. Each step is a different person signing in, which is the point:
no single account can carry a peso from plan to payment.

### Planning (steps 1–3)

**1. `planningofficer` → Development Planning (`/planning`)**
- Create a Comprehensive Development Plan, add a goal or two.
- You cannot adopt your own plan. That is deliberate.

**2. `sangguniansecretary` → Development Planning**
- Record the adopting resolution. The plan becomes `adopted`.

**3. `hope` → Priorities & Investment Program**
- Set the year's priorities against the adopted plan.

**4. `planningofficer`** — prepare the Annual Investment Program, add entries citing the goals,
then submit → **`hope`** endorses → **`sangguniansecretary`** adopts.

> Nothing downstream will open without an **adopted AIP for the year**. That is the first
> "why won't it let me" you will hit, and it is the system working.

### Budget (steps 6–14)

**5. `budgetofficer` → Budget Preparation (`/budget/preparation`)**
- Open the fiscal year. This issues the budget call.

**6. `departmentrequester`** — prepare the Engineering Office's budget proposal; add lines
citing AIP entries; submit.

**7.** Then in order:

| Who | Act |
|---|---|
| `budgetofficer` | Close proposals → Budget Council review (recommend figures line by line) |
| `planningofficer` | Consolidate against the development plan |
| `budgetofficer` / `planningofficer` / `municipaltreasurer` | **Budget Forum** — record estimated income and the expenditure ceiling |
| same three | **Budget Hearing** — record minutes |
| `budgetofficer` | Finalise (strike final figures) |
| `hope` | Approve the executive budget |
| `sangguniansecretary` | Record the Appropriation Ordinance |
| `sangguniansecretary` | Record the Sangguniang Panlalawigan review |

> **Try to break it:** set an expenditure ceiling *above* the estimated income. Refused — the
> budget would not balance (LGC Sec. 324). Try to have `budgetofficer` approve the executive
> budget: refused, that is the Mayor's. Try to have `hope` enact the ordinance: refused, that
> is the Sanggunian's.

**Recording the provincial review is what creates budget** — one appropriation line per
finalised proposal line. Check `budgetofficer` → *Appropriations* afterwards.

### Procurement plan (steps 4–5)

**8. `departmentrequester` → APP Entries (`/app-entries`)**
- Create a line citing **both** an enacted appropriation and a live AIP entry.
- Submit → **`bacsecretariat`** consolidates → **`budgetofficer`** certifies → **`hope`** approves.

> **Try to break it:** set an ABC larger than the appropriation's unprogrammed balance. Refused.
> Choose an alternative procurement mode with no justification. Refused.

### Requisition (steps 15–19) — the five signatures

**9. `departmentrequester` → Purchase Requisitions**
- Create one against the approved APP line, add line items, submit.

Then, in this exact order:

| # | Who | Button |
|---|---|---|
| 15 | **`headofoffice`** | ENDORSE |
| 16 | `municipaltreasurer` | CERTIFY FUNDS AVAILABLE |
| 17 | `hope` | APPROVE REQUEST |
| 18 | `budgetofficer` | CERTIFY APPROPRIATION |
| 18b | **`municipalaccountant`** | OBLIGATE (ORS) |
| 19 | `bacchairperson` | DETERMINE MODE |

> **Try to break it:** have `departmentrequester` endorse their own requisition — refused, "only
> the head of this department may endorse". Have `budgetofficer` obligate — refused, that is the
> Accountant's under LGC Sec. 344. Determine a mode that disagrees with the APP without a
> justification — refused (IRR Sec. 7.8).

The ORS appears in `budgetofficer` → *Appropriations* → obligations. Money is now encumbered.

### Bidding (step 20)

**10. `bacsecretariat` → RFQ Management (`/secretariat/rfq`)**
- Create the solicitation from the approved requisition. The **mode is inherited** — you cannot
  advertise under a different one than the committee minuted.
- If the ABC is ₱3,000,000 or more, you must schedule a **pre-bid conference** before publishing.
- The closing date must leave the statutory posting window open: **7 calendar days** for
  competitive bidding, 3 for Small Value Procurement.

**11. `bacsecretariat` → Observers (`/observers`)**
- Add organisations to the roster: one COA, one private group, one CSO/PO. The private group and
  CSO need an SEC or CDA registration number.
- Invite all three to *Bid evaluation*, scheduled **at least 5 calendar days out**. Try 2 days —
  refused (Sec. 43.2).

**12. `vendor` → Bid Opportunities** — submit a bid. You will be emailed a 6-digit code; in dev
with SMTP blank it prints to the **backend console**.

**13.** After the closing date: `bacsecretariat` closes → opens bids. Try closing early — refused.

**14. `bacchairperson` / `bacmember` → Evaluation Workspace**
- For **goods and infrastructure** you record **pass/fail**, not a score. For consulting services
  you score out of 100. You must declare no conflict of interest first.
- Close evaluation → post-qualify → recommend award.

> **Try to break it:** recommend the *most expensive* post-qualified bid. Refused, and it names
> the bidder that is actually entitled to it (RA 12009 Sec. 65 — the Lowest Calculated
> Responsive Bid).

**15. `observer` → Observed proceedings** — record attendance (a confidentiality agreement is
required), then file an observation report.

**16. `vendor` → Protests** — file a request for reconsideration. Now go back and try to
recommend or approve the award: **refused while a protest is unresolved** (Sec. 84).
- `bacchairperson` decides the reconsideration. If denied, the vendor can escalate to a protest
  to the Mayor — which needs the verified affidavit, the no-forum-shopping certification, and
  the fee (0.75% of the ABC).
- `hope` decides the protest.

**17. `hope` → Award Approvals** — approve, or **disapprove** with written grounds (Sec. 66).

### Contract, delivery, payment

**18. `bacsecretariat` → Contracts** — draft the contract. A **contract period in calendar days**
is required; without it delay and liquidated damages cannot be computed.

**19.** Post the **performance security** (30% by surety bond, or 5%/10% cash). Then try to sign
without it — refused (Sec. 68.1).

**20.** `hope` signs for the LGU → `vendor` countersigns → contract is **active**.

**21. `hope` → issue the Notice to Proceed.** Contract time starts here. Try reporting a delivery
before it — refused.

**22.** `vendor` reports delivery → `departmentrequester` inspects and accepts → `vendor` submits
an invoice → `municipalaccountant` certifies → `municipaltreasurer` releases.

> The voucher shows the government deductions computed automatically: EWT, VAT withholding,
> retention on infrastructure, and liquidated damages if the delivery is late against the NTP.

---

## Things worth deliberately breaking

These all produce a clear refusal, and each one is a rule from the law:

| Try this | Why it is refused |
|---|---|
| Requester edits their own PR to `approved` | Field whitelist — the state machine owns `status` |
| Requester edits another office's requisition | Ownership check |
| Expenditure ceiling above estimated income | LGC Sec. 324 — the budget would not balance |
| Capital item on a MOOE appropriation | COA capitalisation threshold |
| Bid above the ABC | Automatically disqualified |
| Award to a bid that is not the LCRB | RA 12009 Sec. 65 |
| Award while a protest is open | Sec. 84 |
| Sign a contract with no performance security | Sec. 68.1 |
| Close bidding before the advertised deadline | Forecloses the competition |
| Invite observers with 2 days' notice | Sec. 43.2 — five calendar days |

---

## If something goes wrong

**"No adopted Annual Investment Program for &lt;year&gt;"** — work back up the chain: adopted
development plan → Mayor's priorities → AIP prepared → AIP adopted by the Sanggunian.

**A page loads but the API returns 403** — the role reaches the route but lacks the permission.
Re-run `npm run seed`; permissions drift when the matrix changes and the seed is not re-run.

**`GET /api/app-entries` returns 500** — stale schema. Run `node migrate.js --alter`.

**Nothing can endorse a requisition** — that office has no head designated. Fix it at
**`systemadministrator` → Departments → Edit → Head of Office**. The seed designates one for
Engineering automatically.

**The OTP email never arrives** — SMTP is blank in dev by design. The code is printed to the
backend console.

---

## Automated tests

If you would rather watch the rules enforce themselves than click through them:

```bash
cd municipal_backend && DB_NAME=impbbms_scratch node migrate.js --force --yes && DB_NAME=impbbms_scratch node seed.js
```

Start the backend with `DB_NAME=impbbms_scratch PORT=3100 node index.js`, then run
`node tests-e2e-conformance.mjs`, `tests-e2e-award.mjs` and `tests-e2e-sanctions.mjs`.
95 assertions, all against the statutory rules above.
