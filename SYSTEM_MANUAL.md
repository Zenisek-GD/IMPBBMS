# Municipal Budgeting and Procurement Workflow Manual

## 0. Legal basis

Procurement in this system implements **Republic Act No. 12009, the New Government Procurement Act (NGPA)**, and its **Implementing Rules and Regulations, 1st Edition, as of 30 March 2026**.

RA 12009 was signed on 20 July 2024 and took effect on **13 August 2024**. It **repealed RA 9184** (the Government Procurement Reform Act) and Commonwealth Act No. 138. Any reference in older project documents to RA 9184 or its 2016 IRR describes superseded law and should be read as historical.

Budgeting implements **Republic Act No. 7160, the Local Government Code of 1991**, Book II (Local Fiscal Administration) — principally Sections 316 to 344.

Where this manual cites a section number without qualification, it is a section of the **IRR of RA 12009**. Local Government Code citations are written in full as "LGC Sec. NNN".

## 1. Purpose
This system is a role-based municipal platform covering the whole chain from development planning through budgeting, requisitioning, bidding, contracting, delivery tracking, invoicing, budget monitoring, audit review, and transparency publishing.

This manual documents the end-to-end municipal process in the order it actually happens: the Comprehensive Development Plan, the Mayor's priorities, the Annual Investment Program, the PPMP and APP, the budget from proposal to Appropriation Ordinance, and then procurement from Purchase Request to Notice of Award, contract and payment.

It is split into two applications:
- `municipal_backend`: an Express + Sequelize backend with MySQL, session auth, permissions, and a server-rendered home page.
- `municipal-frontend`: a React + Vite front end that provides role-specific dashboards and workflow screens.

### 1.1 The complete process
The twenty steps below are the municipality's process. Each one is a distinct act by a named body, and the system enforces the order — a stage cannot be skipped, and a stage cannot be performed by an office that does not hold its permission.

**Planning**
1. Prepare the Comprehensive Development Plan (multi-year).
2. Determine the Mayor's priorities for the year.
3. Prepare the Annual Investment Program (AIP).
4. Departments prepare **indicative** Project Procurement Management Plans (PPMPs) to support their budget proposals (Sec. 7.7.1).
5. Consolidate the indicative PPMPs into the **Indicative** Annual Procurement Plan; the BAC recommends the mode of procurement to the HoPE (Sec. 7.7.2).

Steps 4 and 5 run *alongside* budget preparation, not after it — that is the whole point of the word "indicative". The **final** APP is a separate, later document: once the Appropriation Ordinance is enacted the offices finalise their PPMPs against the authorised allocation, and those are consolidated into the final APP (Sec. 7.7.5). See §8.

**Budgeting**
6. Departments prepare proposed budgets.
7. The Municipal Budget Council reviews the proposals.
8. The Planning Office consolidates the requests.
9. The Local Finance Committee conducts the Budget Forum.
10. The Budget Hearing is conducted.
11. The budget is deliberated and finalised.
12. The Mayor approves the executive budget.
13. The Sangguniang Bayan reviews and enacts the Appropriation Ordinance.
14. The Sangguniang Panlalawigan reviews the ordinance for legality.

**Procurement**
15. The Head of Office prepares a Purchase Request (PR).
16. The Municipal Treasurer certifies the availability of funds.
17. The Mayor approves the request.
18. The Budget Office certifies that an appropriation exists and identifies the funding source.
18b. The Municipal Accountant obligates that appropriation and raises the Obligation Request (ORS).
19. The BAC determines the mode of procurement.
20. Procurement proceeds through competitive bidding or another legally authorised mode.

Steps 18 and 18b are two officers, not one. LGC Sec. 344 names three: *"the local budget officer certifies to the existence of appropriation that has been legally made for the purpose, the local accountant has obligated said appropriation, and the local treasurer certifies to the availability of funds."* Certifying that an appropriation exists is a statement about the ordinance; obligating it is the entry in the books that encumbers the money. One office doing both puts the check and the book-keeping in the same pair of hands.

### 1.2 Why nothing can be spent without the chain above it
Each layer authorises the one below it, and the system refuses to skip a link:

```
Comprehensive Development Plan   what the municipality committed to
  └─ Development goal / Mayor's priority
       └─ AIP entry               the year's costed projects
            └─ Budget proposal line   what an office asked for
                 └─ Appropriation      what the ordinance granted
                      └─ APP / PPMP line   what will be procured
                           └─ Purchase Requisition
                                └─ Obligation → Contract → Delivery → Payment
```

Concretely: an AIP entry must cite a goal in an **adopted** plan; a budget cannot be opened for a year with no **adopted** AIP; appropriations are written only when the provincial review is recorded; a PPMP line must cite both an **enacted** appropriation and a live AIP entry, and cannot exceed either; and a requisition cannot exceed its PPMP line's remaining balance.

## 2. Core Architecture
### Backend
The backend uses:
- Express for HTTP routing
- express-session for login sessions
- Sequelize for database access
- MySQL as the database
- hbs/Xian templates for the home page and partials
- multer for document uploads
- bcrypt for password hashing
- cors for frontend/backend communication

The backend starts from `municipal_backend/index.js`, mounts the router tree from `municipal_backend/routes/index.js`, and serves the Xian home page plus all API routes.

### Frontend
The frontend uses:
- React 19
- React Router
- React Hook Form + Zod for form validation
- TanStack Query for server state
- TanStack Table for tabular views
- Recharts for charts and summaries
- Tailwind CSS for styling

Login state is loaded from the backend session, then the app routes the user to the correct role landing page.

## 3. Startup and Setup
### Backend
Backend scripts are defined in `municipal_backend/package.json`:
- `npm run xian-start` starts the backend once.
- `npm run xian` starts the backend with nodemon.
- `npm run migrate` drops and recreates all Sequelize tables using `sync({ force: true })`.
- `npm run seed` loads demo roles, departments, permissions, procurement modes, settings, and users.

The database connection in `municipal_backend/models/db.js` reads from the environment, with local development defaults:

| Variable | Default |
|---|---|
| `DB_NAME` | `municipal_backend` |
| `DB_USER` | `root` |
| `DB_PASSWORD` | empty string |
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |

Set them in `municipal_backend/.env`. The host defaults to `127.0.0.1` rather than `localhost` deliberately: on Windows `localhost` resolves to the IPv6 `::1` first while MySQL binds IPv4 only, which fails with `ECONNREFUSED` against a server that is running perfectly well.

Because the name is an environment variable, a throwaway database can be pointed at without touching the working one — useful for testing:

```bash
DB_NAME=impbbms_scratch PORT=3100 node index.js
```

### Frontend
Frontend scripts are defined in `municipal-frontend/package.json`:
- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build.
- `npm run lint` runs ESLint.
- `npm run preview` previews the production build.

### Typical local run order
1. Start MySQL.
2. `node migrate.js` — creates the database if absent, then syncs. Add `--alter` to add new columns to existing tables, or `--force --yes` to drop and recreate everything.
3. `npm run seed` — roles, departments, permissions, procurement modes, settings, demo accounts.
4. `node seedDemo.js` — six full-lifecycle demo projects. Without this, every data-driven screen is empty.
5. Start the backend server.
6. Start the frontend dev server.
7. Open the frontend and log in with a seeded account.

`migrate.js` used to prompt through `inquirer`, so it could not run in a script; and it only ever offered `sync({ force: true })`, which drops every table. It now takes flags, defaults to the safe operation, and `--force` refuses to run non-interactively without `--yes`.

### Automated conformance tests

Three harnesses live in `municipal_backend/` and are the regression suite for the statutory rules:

| File | Covers |
|---|---|
| `tests-e2e-conformance.mjs` | LGC Sec. 323 reenactment, the indicative APP cycle, EPA, observers (Sec. 43), protests (Sec. 83–85), Abstract of Bids |
| `tests-e2e-award.mjs` | The requisition chain through five officers, pre-bid, posting periods, LCRB enforcement, protests blocking award, Sec. 66, performance security, NTP |
| `tests-e2e-sanctions.mjs` | Blacklisting (Sec. 69), failure of bidding (Sec. 64), variation orders and termination (Sec. 71), the 4% contingency ceiling, GPPB submission |

Run them against a **throwaway** database, never your working one:

```bash
DB_NAME=impbbms_scratch node migrate.js --force --yes && DB_NAME=impbbms_scratch node seed.js
```

## 4. Authentication and Access Control
### Login flow
The frontend loads the current user through the auth context in `municipal-frontend/src/context/AuthContext.jsx`.
- On app load, it calls the backend `me` endpoint.
- If no user is active, the app redirects to `/login`.
- On successful login, the user is routed to a role-specific landing page.

### Two-factor authentication
**Every account in the system requires a second factor.** A password is a secret its holder can be tricked into typing somewhere else, and every account here can approve spending, issue a document under the municipality's name, or read the whole procurement record.

The scheme is **TOTP (RFC 6238)** — the six-digit codes produced by Google Authenticator, Microsoft Authenticator, Authy, 1Password and any other standard app. SHA-1, six digits, thirty-second steps, which are the parameters every client assumes.

**The implementation is hand-rolled, deliberately.** `services/totp.js` is the one place where a compromised dependency would be silent and total: a package that returned predictable codes would let anyone in and nothing would look wrong. It is fifty lines of well-specified arithmetic, and the RFC publishes test vectors — so correctness is *proven*, not assumed. Run the proof:

```bash
node municipal_backend/services/totp.test.mjs
```

How it behaves:
- a correct password **no longer creates a session**. It creates a five-minute pending state carrying a user id and nothing else — no permissions are loaded and no protected route accepts it
- accounts that have not enrolled are let in but **confined to the enrolment screen** until they do. Refusing the sign-in outright would have locked out every account the day it shipped, including the administrator who would have to fix it
- a code is **single-use**: the time step it came from is recorded, and any code at or below it is refused. Without this, a code captured by a phishing proxy stays valid for the rest of its window
- **five wrong codes locks the account for 15 minutes**, counted per enrolment rather than per address, because the account is what is under attack
- **ten recovery codes** are issued once at enrolment and stored hashed. Without them a lost phone means an administrator wipe, which is a support burden and a social-engineering target
- **turning it off needs the password *and* a current code** — either alone would let whoever is at an unlocked screen remove the protection
- an **administrator reset** clears an enrolment so the user can set it up again. It cannot reveal or set a secret and cannot sign anybody in, so a compromised administrator gains no path into another account. Reason required, and audited

**The secret at rest** is encrypted with AES-256-GCM under `MFA_ENCRYPTION_KEY` (falling back to `SESSION_SECRET`), never hashed — verification needs the original bytes. That is what makes a database dump insufficient on its own: password hashes survive a leak, and plaintext TOTP secrets would not.

Every change to a second factor is audit-logged: enrolment, failures, recovery-code use, regeneration, disabling and the administrator reset.

### Integrity monitoring and anomaly detection
The audit log proves that nothing **recorded** has been altered. It cannot notice a change that was never recorded in the first place — and that is the real threat. Somebody with a MySQL client can raise an appropriation, grant themselves a permission or delete an award, and the application will never know. The chain stays perfectly intact and perfectly silent, because nothing asked it to write anything.

`services/integrityMonitor.js` closes that gap by exploiting one asymmetry: **every legitimate change goes through the application, and the application fingerprints the row as it writes it.** Three conditions then each mean the same thing:

| Condition | Meaning |
| --- | --- |
| Row present, fingerprint no longer matches | altered outside the system |
| Row present, no fingerprint at all | inserted outside the system |
| Fingerprint present, row gone | deleted outside the system |

Ten tables are watched by their *material* columns — the ones whose alteration changes what the record means: appropriations, obligations, requisitions, awards, bids, contracts, payments, users (including the password hash), vendors and APP entries. `updatedAt` is deliberately excluded; it moves on every save and would make the fingerprint useless.

Role grants are fingerprinted separately, one per role over its sorted permission set, so a raw `INSERT INTO rolepermissions` is caught. That is the highest-value silent attack on this system: it steals nothing directly, it makes everything else stealable.

**Bulk writes need care.** `Model.update(values, { where })` and `Model.destroy({ where })` fire only Sequelize's *bulk* hooks, so the per-row fingerprint hooks never run and the rows change while their fingerprints do not. Approving an award does exactly this — `Bid.update({ status: "lost" }, { where: { rfqId } })` — so every losing bid would have been flagged after every award. A `beforeBulkUpdate`/`beforeBulkDestroy` hook asks Sequelize for `individualHooks`, so one correct path handles every kind of write. False alarms on the core workflow are how a monitor gets ignored, which costs more than never having built it. Guarded by a regression test:

```bash
node municipal_backend/services/integrityMonitor.test.mjs
```

`services/anomalyDetector.js` adds eight behavioural rules over the audit log — chain verification, sign-in failure clustering, second-factor failures (distinguishing wrong codes from **reused** ones, which indicate interception), privilege changes, administrator second-factor resets, off-hours consequential acts, bulk downloads, identical bid documents, and bid IP clustering. Each rule is isolated, so one failing rule does not stop the rest.

Findings become alerts with a severity, deduplicated so a recurring finding increments a counter rather than burying the new ones. Nothing is ever deleted, and closing an alert requires a written reason — an alert closed silently tells the next reviewer nothing.

**Who is told.** Critical and high findings notify holders of `security.view`: the System Administrator and the Internal Auditor, and nobody else. The narrowness is deliberate. `audit.viewAll` would have been the obvious choice and is held by almost every officer — a finding like *"the appropriations table was altered in raw SQL"* would then reach nineteen inboxes, one of which may belong to whoever did it. The auditor is included precisely because the administrator is the one person with both the database access to make such a change and the motive to suppress the alert.

Scans run every 30 minutes (`SECURITY_SCAN_MINUTES`) and on demand from the console at `/admin/security`. The console reports when the last scan ran and warns after two hours of silence — a monitor that has stopped reports "no findings" exactly like a clean system does.

**Proving it works.** `services/integrityMonitor.proof.mjs` makes four unauthorised changes in raw SQL — inflates an appropriation by ₱5,000,000, grants `payment.release` to the Vendor role, deletes a bid, inserts a fabricated ₱750,000 payment — shows that **zero** audit entries resulted, then shows the scan catching all four and notifying the administrator. It restores the database afterwards.

```bash
node municipal_backend/services/integrityMonitor.proof.mjs
```

Pass `--keep` to leave the alerts standing so the console can be demonstrated; it then prints the SQL to undo each change.

### Backend security
The backend uses session-based authentication and permission checks:
- `requireAuth` blocks unauthenticated requests.
- `requirePermission` blocks requests unless the user has every required permission.
- `requireAnyPermission` allows a request if the user has at least one accepted permission.

Permissions are defined in `municipal_backend/config/permissionMatrix.js` and seeded into the database.

### Frontend security
The frontend route guards in `municipal-frontend/src/routes/ProtectedRoute.jsx` and `municipal-frontend/src/routes/RoleRoute.jsx` control navigation, but they are not the security boundary. The backend still enforces the real access rules.

## 5. Roles and Landing Pages
Seeded roles are created in `municipal_backend/seed.js`. Each role has a landing page defined in `municipal-frontend/src/config/roleLanding.js`.

- System Administrator -> `/admin`
- HOPE / Municipal Mayor -> `/executive`
- Municipal Planning and Development Coordinator -> `/planning`
- Secretary to the Sangguniang Bayan -> `/budget/preparation`
- BAC Chairperson -> `/bac-chair`
- BAC Vice-Chairperson -> `/bac-chair`
- BAC Member -> `/bac-member`
- BAC Secretariat -> `/secretariat`
- TWG Member -> `/twg`
- Department Requester -> `/dashboard`
- Budget Officer -> `/budget`
- Municipal Accountant -> `/finance`
- Municipal Treasurer -> `/finance`
- Vendor / Supplier -> `/supplier`
- Observer / Public Auditor -> `/transparency`
- Internal Auditor -> `/audit`

### 5.1 Committees are permissions, not roles
Three bodies in the process have no role of their own, because their membership is a matter of law or local practice rather than a job title:

- **Local Finance Committee** — LGC Sec. 316 fixes its membership as the Planning and Development Coordinator, the Budget Officer and the Treasurer. All three hold `budget.conductForum` and `budget.conductHearing`; nobody else does.
- **Municipal Budget Council** — membership is not fixed by statute, so it is expressed by holding `budget.reviewProposal`. An administrator can widen it without a code change.
- **Bids and Awards Committee** — modelled through the BAC roles. The mode determination is held by the **Chairperson and Vice-Chairperson**, not the Secretariat: recommending the method of procurement is a responsibility of the committee, and the Secretariat is its support unit, not a member of it.

The **Vice-Chairperson** is a role rather than a courtesy title. The quorum rule turns on it — a majority constitutes a quorum *"provided that the Chairperson or the Vice-Chairperson should be present in all meetings and deliberations"* — so without the office a committee whose Chairperson is on leave cannot lawfully sit at all. See `services/bacCommittee.js`.

The **Sangguniang Bayan** and the **Sangguniang Panlalawigan** are deliberative bodies outside the system. What belongs in the system is the minute of their action, entered by the Sanggunian's secretary — which is why that role records ordinances and provincial reviews but decides nothing.

## 6. Seed Data
The seed script creates the core reference data needed to use the system.

### Seeded roles
- System Administrator
- HOPE (Municipal Mayor)
- Municipal Planning and Development Coordinator
- Secretary to the Sangguniang Bayan
- BAC Chairperson
- BAC Member
- BAC Secretariat
- TWG Member
- Department Requester
- Budget Officer
- Municipal Accountant
- Municipal Treasurer
- Vendor / Supplier
- Observer / Public Auditor
- Internal Auditor

### Seeded departments
The seed includes common municipal offices:
- Office of the Mayor
- Office of the Sangguniang Bayan
- Municipal Planning and Development Office
- Bids and Awards Committee
- BAC Secretariat
- TWG
- Budget Office
- Accounting Office
- Treasurer's Office
- General Services Office
- Engineering Office
- Health Office
- IT Office
- Internal Audit Service

### Seeded procurement modes
The system seeds the standard procurement modes, including competitive bidding and alternative modes such as limited source bidding, direct contracting, negotiated procurement, and others.

### Seeded demo accounts
The demo accounts use the email pattern:
- `{rolekey}@civicbid.test`

All demo accounts use the same seed password:
- `Passw0rd!`

This password is for local development only and should not be reused in any real deployment.

### Seeded system settings
The seed also registers LGU settings such as:
- LGU name
- LGU type
- LGU income class

Plus the **capitalisation threshold** (`accounting.capitalizationThreshold`, seeded at ₱50,000 per COA Circular 2022-004). It decides whether a long-lived item on a requisition is Capital Outlay or semi-expendable property, and therefore which expense class it may be charged to. An administrator can change it at `/admin/settings` without a code change.

These settings affect procurement thresholds, accounting classification, and system displays.

## 7. Main Functional Areas
### 7.1 Administration
Used by the System Administrator.

Frontend pages:
- Admin dashboard
- User management
- Department management
- System settings

Backend routes:
- `/api/users`
- `/api/departments`
- `/api/settings`
- `/api/auth`

Typical tasks:
- create and maintain user accounts
- assign roles and departments
- update system settings
- review system logs

### 7.2 Development Planning
Used by the Planning Office, the Mayor, the Sanggunian's secretary, and read by every office that has to cite a plan.

Frontend page:
- Development Planning (`/planning`) — the plan, its goals, the Mayor's priorities, and the investment program on one screen

Backend routes:
- `/api/planning/plans`, `/api/planning/plans/:id/goals`, `/api/planning/plans/:id/adopt`
- `/api/planning/priorities`
- `/api/planning/investment-programs`, `/api/planning/aip-entries`

Typical tasks:
- record and adopt the Comprehensive Development Plan and its goals
- set and rank the Mayor's priorities for a fiscal year
- prepare, endorse and adopt the Annual Investment Program

### 7.3 Budget Preparation and Legislation
Used by every office that prepares a proposal, the Municipal Budget Council, the Planning Office, the Local Finance Committee, the Mayor and the Sanggunian's secretary.

Frontend page:
- Budget Preparation (`/budget/preparation`) — a stage-by-stage view of where the year's budget currently sits

Backend routes:
- `/api/budget-preparation/budgets`, `/api/budget-preparation/budgets/:id/transition`
- `/api/budget-preparation/budgets/:id/proceedings`
- `/api/budget-preparation/proposals` and its `/submit`, `/review`, `/finalise`, `/return` actions

Typical tasks:
- open a fiscal year for proposals and issue the budget call
- prepare, submit and revise an office's budget proposal
- record the Budget Council's recommended figures line by line
- consolidate against the development plan
- record forum and hearing minutes, set income estimates and expenditure ceilings
- strike final figures, approve the executive budget, record the ordinance and the provincial review

### 7.4 Annual Procurement Plan and Purchase Requisitions
Used by department requesters, BAC Secretariat, budget officers, HOPE, and other authorized roles.

Frontend pages:
- APP entries
- Purchase requisitions
- PR command center
- Pending items

Backend routes:
- `/api/app-entries`
- `/api/purchase-requisitions`
- `/api/pending-items`

Typical tasks:
- create APP entries
- submit and consolidate APP lines
- create purchase requisitions
- endorse, certify, review, and approve requests
- track items that need attention

### 7.5 Bidding and Vendor Verification
Used by BAC Secretariat, BAC Chairperson, BAC Members, TWG, vendors, observers, and internal auditors.

Frontend pages:
- RFQ management
- Vendor verification
- Evaluation workspace
- BAC dashboards

Backend routes:
- `/api/bidding`
- `/api/vendors`
- `/api/conferences`

Typical tasks:
- create and publish RFQs or ITBs
- open bids
- submit vendor bids
- evaluate technical and commercial offers
- verify vendors
- recommend and approve awards
- schedule live conferences

### 7.6 Contracts and Deliveries
Used by BAC Secretariat, BAC Chairperson, department requesters, vendors, finance, observers, and internal auditors.

Frontend pages:
- Contracts
- Deliveries
- Live Conference

Backend routes:
- `/api/contracts`

Typical tasks:
- draft contracts
- issue contracts for signature
- sign agreements
- report and inspect deliveries

### 7.7 Budget and Finance
Used by budget officers, finance officers, HOPE, vendors, and auditors depending on the task.

Frontend pages:
- Budget dashboard
- Finance dashboard
- Invoices
- Unexpended monitor
- Pending items

Backend routes:
- `/api/finance`

Typical tasks:
- certify budget availability
- monitor unexpended funds
- submit and certify invoices
- process payments and release disbursements
- manage finance-related pending items

### 7.8 Audit and Transparency
Used by internal auditors, system administrators, and the public-facing observer role.

Frontend pages:
- Audit log
- DSS dashboard
- Transparency dashboard
- Transparency portal

Backend routes:
- `/api/audit`
- `/api/dss`
- `/api/transparency/*`

Typical tasks:
- inspect full workflow history
- verify audit chain integrity
- export audit logs where permitted
- view published-only procurement records
- expose approved APPs, procurements, and awards to the public portal

### 7.8a Invitation to Bid and Public Posting
Used by the BAC Secretariat; read by anyone, with no account.

Frontend page: Invitation to Bid (`/announcements/itb`).
Backend: the authoring half under `/api/announcements`, the public half under `/api/public/announcements`.

**Two documents, one invitation.** The *announcement* is the public-friendly posting on the transparency portal. The *Invitation to Bid letter* is the official signed instrument, generated in the documents module (§7.9) from the same solicitation. Both draw their figures from the `Rfq`, so they cannot disagree.

**Particulars are copied once, then frozen.** Linking a notice to its solicitation pulls the reference, ABC, mode, citation and schedule from the record rather than having an officer retype them. From that moment the notice holds its own copy — a published invitation must not change because somebody edited the RFQ behind it.

Rules enforced and verified:
- a notice is always born a **draft**; publication is a separate, audited act
- bid opening cannot precede the submission deadline, and a pre-bid conference cannot follow it
- the rich body is **sanitised on the way in**, and the plain-text `body` is derived from it so older consumers keep working
- an unpublished notice and its attachments return **404** to the public, never 403
- **duplicating** reuses the wording, contact and venue but deliberately drops the reference, ABC and every date — inheriting last year's deadline silently is how a bad invitation goes out
- a draft that was never published cannot be archived into public view
- attachments are scoped to their notice: an attachment id cannot be fetched by pairing it with a different published notice

**Scheduling.** `publishAt` releases a notice automatically. The sweep runs on the public listing as well as on demand, so a schedule works even with no cron attached — the alternative is a notice that silently never publishes.

**The archive is public.** Notices the office retired, and published notices that have simply expired, stay readable at `/api/public/announcements/archive`. A procurement that vanishes from the record once it closes is the opposite of transparency.

Public readers get search (title, reference, mode), category and open/closed filters, four sort orders, key dates, and attachment downloads — all without an account.

### 7.9 Document Templates and Auto-Generation
Used by the BAC Secretariat (authors and issues), the Mayor (approves), and read by the Internal Auditor.

Frontend pages:
- Document Templates (`/documents/templates`) — authoring with a placeholder palette and version history
- Official Documents (`/documents`) — generate, preview, edit, approve, publish, download

Backend routes: `/api/doc-generation/*`, plus the public `/api/public/documents`.

**How it works.** A template is HTML with `{placeholder}` tokens. Generating resolves those against the procurement record — supplier, project, amounts, dates, signing official — so nothing is retyped. The merged HTML is rendered to PDF by headless Chrome and stored in the attachment table.

Templates ship for all eight required types: Notice of Award, Notice to Proceed, Contract Agreement, Purchase Request, Inspection and Acceptance Report, and Certificates of Recognition, Participation and Appreciation.

**Version control.** Editing a template writes a **new version**; the old one is append-only at the model level. A document generated last March still resolves against the wording in force then, and any version can be reactivated.

**Three things are snapshotted at generation**, each answering a question asked later: the rendered HTML including any manual edit, the resolved placeholder values (a supplier's address changes; the document still bears the old one), and the template version id.

**Amounts spell themselves out** — `TWO MILLION SEVEN HUNDRED THREE THOUSAND FIVE HUNDRED PESOS AND 00/100` — because official documents carry both forms and a figure in words cannot be altered by adding a digit.

Rules enforced and verified:
- the officer who **generated** a document cannot **approve** it — the same separation as certify-versus-release on a disbursement
- a document cannot be published unless it is approved **and** its type is publishable; an internal requisition form is refused even when approved
- an unpublished document returns **404** to the public, not 403 — a 403 would confirm it exists to anyone probing ids
- manual edits are allowed on drafts only, are flagged on the record, and drop the cached PDF so a stale copy cannot be downloaded as current
- voiding requires a reason and withdraws the document from the portal; the original is never deleted, since it may already be in a supplier's hands
- generation, edits, approvals, **downloads**, publication and voiding are all audit-logged

**Security.** Template HTML is filtered by an allow-list sanitiser before rendering or publishing — `<script>` and its contents, `on*` handlers, anchors, iframes and `url()` in CSS are all dropped, and images may only be inline `data:` URIs. The PDF renderer independently blocks all network requests, so a template cannot make the server fetch a URL of its author's choosing.

> **Deployment requirement:** the server needs Chrome, Chromium or Edge installed. Set `CHROME_PATH` in the backend `.env` to point at it; otherwise the usual install locations are searched. Without a browser, PDF endpoints return 503 with a clear message and everything else continues to work.

### 7.10 Notifications and Documents
The system also supports:
- notification inbox and read status
- document upload, download, and deletion

Backend routes:
- `/api/notifications`
- `/api/documents`

## 8. The End-to-End Workflow
This is the full path the system implements, in the order the municipality performs it.

**How stage-skipping is prevented — and how it was not.** Every status change goes through a centralised state machine. That was always true of the `/transition` endpoints, but it was *not* true of the system as a whole: the `PATCH` endpoints for requisitions and APP entries spread the request body straight into the model, and `status` is a model attribute. A Department Requester holding only `pr.create` could `PATCH` their own draft to `status: "approved"`, raise the total past the APP balance, and stamp all four signature columns with other officers' ids — producing no obligation and no audit entry.

The fix is a **field whitelist** on every write path (`EDITABLE_PR_FIELDS`, `EDITABLE_APP_FIELDS`), not a blacklist: a blacklist has to be updated every time a column is added, and the failure mode of forgetting is silent. Anything the state machine or the server derives — status, the certification stamps, the obligation fields, the determined mode, totals — is simply not writable from a request body.

When adding a column to `PrHeader` or `AppEntry`, ask whether an officer should be able to type it. If not, leave it out of the whitelist and it is safe by default.

| Stage | State machine |
|---|---|
| Investment program | `services/aipWorkflow.js` |
| Executive budget | `services/budgetPreparationWorkflow.js` |
| APP / PPMP | `services/appWorkflow.js` |
| Purchase Requisition | `services/prWorkflow.js` |

### Steps 1–3: Plan, prioritise, programme
The Planning Office records the Comprehensive Development Plan and its goals; the Sanggunian's secretary records the adopting resolution. The Mayor then names and ranks the year's priorities against that adopted plan. The Planning Office prepares the Annual Investment Program from those goals, the Mayor endorses it, and the Sanggunian adopts it.

```
draft → pendingMayorEndorsement → pendingSanggunianAdoption → adopted
```

Frontend: Development Planning (`/planning`).

Rules enforced: only the Sanggunian's secretary may record adoption — the Planning Office cannot adopt its own plan; priorities may only be set against an **adopted** plan; an AIP entry must cite a goal belonging to the plan the programme implements; an adopted programme's entries may be dropped or annotated but not re-costed.

### Steps 6–14: From an office's request to an Appropriation Ordinance
Opening a fiscal year requires an **adopted** AIP — there must be an agreed list of projects before there is anything to appropriate for. Opening it issues the budget call to every office that prepares a proposal.

```
draft → pendingMbcReview → pendingPlanningConsolidation → pendingBudgetForum
      → pendingBudgetHearing → pendingFinalisation → pendingMayorApproval
      → pendingSanggunianAction → pendingProvincialReview → enacted
```

Frontend: Budget Preparation (`/budget/preparation`).

Rules enforced and verified:
- the Budget Council's review cannot complete while any line lacks a recommended figure, and a review may **reduce** a request but never enlarge it
- consolidation flags capital outlay requests that cite no AIP entry, since those fund projects the LGU never programmed
- the forum cannot conclude without an estimated income and an expenditure ceiling, and a ceiling above the estimated income is refused — the budget would not balance (LGC Sec. 324)
- the growth ceiling (default 5% over last year's appropriation) is a **flag, not a gate**: an over-ceiling proposal is allowed through but requires a justification, because the hearing is where that argument belongs
- hearings cannot conclude with no minutes on record
- finalisation refuses a total above the ceiling the forum set
- the Mayor cannot enact the ordinance, and the Sanggunian's secretary cannot approve the executive budget
- an ordinance the province declared **inoperative in full** releases nothing and must be revised and re-enacted

**Enactment is what creates budget.** Recording the provincial review writes one `Appropriation` per finalised proposal line, carrying the ordinance number and the ids it came from, so every peso traces back to the request and the AIP project behind it. Lines struck to zero in deliberation are not appropriated but stay on the proposal as the record of what was asked and refused.

**When the Sanggunian does not enact in time (LGC Sec. 323).** If the ordinance has not passed by the start of the fiscal year, *"the annual appropriations of the preceding fiscal year shall be deemed reenacted and shall remain in force and effect"* until it does. This happens by operation of law — the LGU keeps operating and keeps spending — so the system has to be able to express it, or a municipality in that position would find every requisition refused for want of an appropriation.

`POST /api/finance/appropriations/reenact` copies the prior year's enacted lines forward as `type: "reenacted"`. What carries over is limited to salaries of existing positions, statutory and contractual obligations, and essential operating expenses — so **Personal Services and MOOE only. Capital Outlay is deliberately excluded**, which is exactly the constraint that stops an LGU under a reenacted budget from starting new projects.

**The general limitations (LGC Sec. 324(b), 324(d), 325(a)).** The balanced-budget rule is not the only arithmetic constraint on an LGU budget, and the other three are the ones COA raises findings on:

| Limitation | Rule |
|---|---|
| **Personal Services cap** (Sec. 325(a)) | ≤ 45% of the *prior* year's regular income for 1st–3rd class LGUs; 55% for 4th class and below |
| **20% Development Fund** (Sec. 324(b)) | ≥ 20% of the National Tax Allotment must go to development projects |
| **5% LDRRMF** (Sec. 324(d)) | ≥ 5% of estimated regular income set aside for disaster risk reduction |

These are checked at **finalisation** — the point where the figures stop moving — and **reported, not refused**. The figures they need (the prior year's regular income, the NTA) are recorded on the budget by the Finance Committee, and a municipality that has not entered them yet should not be blocked by a check it cannot satisfy. What it should not be able to do is finalise without being told: the findings are written onto the budget so the Mayor and the Sanggunian see them, and into the audit trail so a later reviewer can see they were known about.

**The statutory calendar (Sec. 318, 319, 321).** Departmental estimates 15 July; executive budget to the Sanggunian by 16 October; ordinance by year end. Reported rather than gated — a budget submitted late is late, not void.

### Steps 4–5: PPMP lines and the APP

Sec. 7.7 gives the plan **two cycles**, and the system models both through `AppEntry.planCycle`.

**The indicative cycle** (`planCycle: "indicative"`) runs during budget preparation, before anything is appropriated. An indicative line cites a live AIP entry and **must not cite an appropriation** — there is none yet. Its purpose is to support the office's budget proposal (Sec. 7.7.1) and to be consolidated into the Indicative APP, which the BAC then uses to recommend the mode of procurement to the HoPE (Sec. 7.7.2).

**The final cycle** (`planCycle: "final"`) runs once the Appropriation Ordinance is enacted. A final line cites **both** an enacted appropriation and a live AIP entry, and cannot exceed either (Sec. 7.7.5).

Both travel the same approval chain:

```
draft → pendingConsolidation → pendingBudgetCertification → pendingHopeApproval → approved (locked)
```

The plan stage advances with the workflow, and where it lands depends on the cycle:

| Cycle | On consolidation | On approval |
|---|---|---|
| indicative | `indicativeApp` | `updatedIndicativeApp` (Sec. 7.7.4 — the EPA basis) |
| final | `indicativeApp` | `finalApp` (Sec. 7.7.5) |

**Early Procurement Activities (EPA).** An indicative line flagged `earlyProcurement` may be advertised *before* the ordinance is enacted, against the updated Indicative APP. This is one of the substantive changes RA 12009 made and it is why the indicative cycle matters operationally rather than only on paper — without it an LGU cannot start buying until the ordinance passes, and loses the first quarter of the year.

An EPA solicitation is raised against the **plan line**, not a requisition, because there is nothing to obligate yet:

```
POST /api/bidding/rfqs   { appEntryId, title, category, closingDate }
```

Everything up to award is lawful. **The award is not**: `approveAward` refuses on an EPA solicitation until the plan line has been finalised against an enacted appropriation. That is the line EPA may not cross.

**The mode of procurement appears twice, and the two must agree.** Sec. 7.7.2(d) makes the mode a required field of the APP; Sec. 7.8 says no procurement may be undertaken except in accordance with the approved APP. So the APP's mode is checked against the Sec. 32/34 ceilings when the line is created, and the BAC's determination on the requisition is refused if it silently disagrees with the plan. Departing from the plan is allowed — it just has to be written down.

**Revision and cancellation.** Projects get rescoped and dropped mid-year, so `app.revise` reopens a locked line (sending it back through the whole approval chain) or cancels it outright. Both demand remarks, and both are refused while any requisition is still live against the line. A cancelled line releases the amount it had programmed back to its appropriation.

Frontend: APP Entries (`/app-entries`).

Backend:
- `GET|POST /api/app-entries`, `PATCH /api/app-entries/:id`
- `POST /api/app-entries/:id/transition`

### Steps 15–19: The Purchase Requisition
This is the order the signatures appear on the municipality's Purchase Request form:

```
draft
  → pendingDepartmentHeadEndorsement   Head of Office endorses
  → pendingCashCertification           Treasurer certifies funds available   (step 16)
  → pendingMayorApproval               Mayor approves the request            (step 17)
  → pendingBudgetCertification         Budget Office certifies the appropriation
                                       and names the funding source          (step 18)
  → pendingAccountantObligation        Accountant obligates it, raises the ORS (step 18b)
  → pendingModeDetermination           BAC determines the mode of procurement (step 19)
  → approved                           cleared for procurement               (step 20)
```

> **Note on ordering.** An earlier build ran Budget → Treasury → Secretariat → Mayor, reasoning from LGC Sec. 344. That section governs **disbursement** — the voucher stage, which this system implements separately — not the requisition. The order above is the LGU's actual practice, and it is also the safer one: obligating an appropriation before the Mayor has approved the request means every refused requisition silently holds budget in the meantime. The reasoning is recorded in full at the top of `services/prWorkflow.js`.

**Three officers, three questions, LGC Sec. 344.** They must never be merged:

| Officer | Question | Stamp |
|---|---|---|
| Municipal Treasurer | Is the cash actually there? | `cashCertifiedAt` |
| Budget Officer | Is there an appropriation, and room left under it? | `appropriationCertifiedAt` |
| Municipal Accountant | Obligate it — encumber the money in the books | `fundsReservedAt` + an `Obligation` row |

An appropriation can be intact while collections have not come in, which is what the Treasurer's signature exists to catch. And certifying that an appropriation exists is a different act from making the entry that commits it — the system originally had the Budget Officer doing both, leaving the Accountant out of the requisition chain entirely.

**Asset classification.** Each line item declares whether it has a useful life beyond one year. The server derives the class from that and the **unit** cost against the capitalisation threshold (ten chairs at ₱6,000 are ten semi-expendable items, not one capital asset):

| Class | Condition |
|---|---|
| `expense` | consumed within the year |
| `semiExpendable` | lasts beyond a year, unit cost below the threshold |
| `capitalOutlay` | lasts beyond a year, unit cost at or above the threshold |

Capital items cannot be charged to a MOOE appropriation; the check runs at creation so the requester finds out while they can still change the requisition.

**Mode determination (step 19).** The committee sees what the IRR ceilings indicate for the ABC, with the citation, before it chooses. Departing from the indicated mode is allowed but never silent — it requires a written justification, and a mode the IRR conditions on prior HOPE approval requires that approval's reference. The determination is stamped on the requisition with its date and officer, and the RFQ **inherits** it: a solicitation cannot advertise a mode other than the one minuted.

Frontend: Purchase Requisitions (`/purchase-requisitions`).

Backend:
- `GET|POST /api/purchase-requisitions`, `PATCH /api/purchase-requisitions/:id`
- `POST /api/purchase-requisitions/:id/transition`
- `GET /api/purchase-requisitions/app-balance/:appEntryId`
- `GET /api/purchase-requisitions/:id/mode-suggestion`

### Step 20: Publish the RFQ or ITB
The BAC Secretariat creates the bidding record and publishes the solicitation.

Frontend:
- RFQ Management

Backend:
- `GET /api/bidding/rfqs`
- `POST /api/bidding/rfqs`
- `POST /api/bidding/rfqs/:id/publish`
- `POST /api/bidding/rfqs/:id/open`
- `POST /api/bidding/rfqs/:id/close`
- `POST /api/bidding/rfqs/:id/cancel`

Vendors can view published opportunities and submit bids where allowed.

### Bid opening and evaluation

**Two different instruments for two different questions.** Philippine competitive bidding does *not* score Goods and Infrastructure on a weighted rubric:

| Category | Technical component | Award goes to |
|---|---|---|
| Goods, Infrastructure | **Pass / fail** against the requirements. One failure fails the bid — the requirements are a floor, not an average. | The **lowest calculated** responsive bid (LCRB) |
| Consulting Services | A **rating** out of 100, against the minimum the Bidding Documents set | The **highest rated** responsive bid (HRRB) |

The system originally applied a 0–100 rubric with a hard-coded 60 pass mark to everything, which meant a goods procurement could turn on how generously a member scored rather than on price — and could not produce a legally correct goods award at all.

**Conflict of interest.** An evaluator must positively declare no actual or potential interest in the bidder before scoring. There was no check at all: any holder of `bidding.evaluate` could score any bid.

**Failure of bidding (Sec. 64).** Declared with a stated ground, and *counted*: after the **second** failure on the same project the LGU may resort to Negotiated Procurement under Sec. 35.1, subject to the BAC's mandatory review of terms and cost estimates, and an ABC that may not rise more than 20% over the last failed bidding.

The BAC and TWG evaluate the received bids.

Frontend:
- Evaluation Workspace
- Vendor Verification

Backend:
- `GET /api/bidding/rfqs/:id/bids`
- `POST /api/bidding/bids/:bidId/evaluations`
- `POST /api/bidding/rfqs/:id/close-evaluation`
- `POST /api/bidding/bids/:bidId/post-qualification`

At this point the system records scoring, technical input, and post-qualification results.

### Observers (Sec. 43)

The BAC must invite, in addition to the COA representative, **at least two observers** — one from a duly recognised private group relevant to the procurement, one from a CSO or PO — to six stages: eligibility checking, short-listing, the pre-bid conference, preliminary examination of bids, bid evaluation, and post-qualification.

Enforced rules:
- **Five calendar days' notice**, in writing (Sec. 43.2). A shorter invitation is refused, not flagged — an invitation that arrives too late to act on does not discharge the obligation.
- Private groups and CSOs must be **registered with the SEC or the CDA** (Sec. 43.1.2). COA carries no such requirement.
- An observer must enter a **confidentiality agreement** before attending (Sec. 43.5).
- An observer with an interest must **inhibit in writing** (Sec. 43.4(c)).
- **Observation Reports** go to the HoPE, PhilGEPS, COA, the GPPB and the Ombudsman. If none is filed within **seven calendar days**, the proceedings are presumed regular (Sec. 43.4(b)) — so the *absence* of a report is itself a finding, and the system reports it as `presumedRegular`.

Absence does not nullify the proceedings **provided the observers were duly invited**. That is exactly why the invitation is a record rather than a courtesy.

Backend: `/api/observers/*` — roster, invitations, per-stage coverage, attendance, reports.

### Award recommendation and approval
After evaluation, the BAC Chairperson recommends the award and HOPE approves it.

Backend:
- `POST /api/bidding/bids/:bidId/recommend-award`
- `POST /api/bidding/awards/:id/approve`
- `POST /api/bidding/awards/:id/disapprove` — Sec. 66; requires written grounds, furnished to the BAC
- `GET /api/bidding/rfqs/:id/abstract` — the Abstract of Bids (Sec. 34.3(f), 43.5)
- `GET /api/bidding/awards`

This is where the Notice of Award is generated.

**Who is entitled to the award is not the committee's choice.** Sec. 65 gives the contract to the **Lowest Calculated Responsive Bid** for Goods and Infrastructure, and the **Highest Rated Responsive Bid** for Consulting Services. `recommendAward` ranks the contenders and refuses any bid that is not top of the ranking, naming the bidder that is. The award moves down the list only when the bidder ahead fails post-qualification — which is the real procedure.

Three further gates sit on the award:
- **Quorum.** The BAC resolves as a body: a majority (one-half plus one, never fewer than three) with the Chairperson **or Vice-Chairperson** presiding. Checked *before* the Award row is written, so a committee that cannot lawfully sit leaves no dangling Notice of Award.
- **Protests.** Sec. 84: *"Protests must first be resolved before any award is made."* Checked at both recommendation and approval — a protest is most likely to be filed in the window between the two.
- **EPA.** No award until the ordinance is enacted (see §Steps 4–5).

### Protests (Sec. 83–85)

A losing bidder's remedy, and under Sec. 85 a **precondition to going to court** — cases filed without exhausting it are dismissed for lack of jurisdiction.

Two stages, and the first is a condition of the second:

```
requestForReconsideration → to the BAC, within 3 calendar days of notice; decided within 7
protest                   → only if DENIED; to the HoPE, within 7 days, as a verified
                            position paper with a non-refundable fee; decided within 7
```

The BAC decides reconsiderations (`protest.resolve`); the HoPE decides protests (`protest.decide`). They are deliberately different permissions — one holder for both would let the committee decide the appeal against its own decision.

An unverified position paper "produces no legal effect, and results in the outright dismissal of the protest" (Sec. 83.3), so verification and the no-forum-shopping certification are hard requirements. The fee follows the Sec. 83.2 schedule (0.75% of ABC at or below ₱50M, rising by band). For LGUs the local chief executive's decision is final and executory at or below ₱1.25M for Goods, ₱12.5M for Infrastructure and ₱2.5M for Consulting Services (Sec. 84.3).

Backend: `/api/protests/*`.

### The Notice of Award
In the codebase, NOA is not a separate page. It is stored as the award record field `noaNumber`.

Behavior:
- the system creates a numbered NOA value like `NOA-YYYY-0001`
- the award date is stored as `noaDate`
- award notifications surface the text “Notice of Award”
- contracts and transparency views reference the same NOA record

Frontend views that expose it:
- Contracts
- Transparency Portal
- supplier and BAC dashboard summaries

### Contract, delivery and payment
After NOA approval, the workflow continues into contract drafting, security, signature, the Notice to Proceed, delivery reporting, and invoice processing.

```
draft → pendingSignatures → active → (Notice to Proceed) → deliveries → completed
```

**Performance security comes first.** Sec. 68.1: the winning bidder *"shall post a performance security prior to the signing of the contract"*. `signContract` refuses without one, and the amount is checked against the Sec. 68.4 schedule — 30% by surety bond, 5% (goods/consulting) or 10% (infrastructure) in cash. A Performance Securing Declaration carries no deposit and is measured differently.

**The Notice to Proceed is a separate instrument from the signature.** It is the day contract time starts, and therefore the day from which delay — and liquidated damages — are measured. A contract is drafted with a `contractDays` period; without an NTP there is no day zero and `services/deductions.js` can compute nothing. Deliveries are refused before one has been issued.

Frontend:
- Contracts
- Deliveries
- Live Conference

Backend:
- `GET /api/contracts`
- `POST /api/contracts` — requires `contractDays`
- `POST /api/contracts/:id/issue`
- `POST /api/contracts/:id/performance-security`
- `POST /api/contracts/:id/sign`
- `POST /api/contracts/:id/notice-to-proceed`
- `GET /api/contracts/deliveries/all`
- `POST /api/contracts/:id/deliveries`

The LGU's signature is the **Local Chief Executive's**, not the BAC Chairperson's. LGC Sec. 22(c) puts it there, and the officer who chaired the committee recommending the award must not also be the officer who binds the municipality to it.

### Contract implementation (Sec. 71)

**Variation orders.** Change and Extra Work Orders for infrastructure, Amendments to Order for goods. Two rules are enforced: the **cumulative** value may not exceed **10% of the original contract price** — the ceiling is on the total, not on each order — and the **performance security must be updated first** (Sec. 68.1), because a variation that enlarges the contract while the security still covers the original price leaves the LGU under-secured on the difference.

**Termination.** For default, breach, unlawful acts, or the LGU's own convenience. The ground decides what happens to the money: termination for fault **forfeits** the performance security; termination for convenience **releases** it, because that is the LGU's choice rather than the supplier's failure.

**Warranty security.** Posted on final acceptance at 1% of the contract price, covering defects during the warranty period. Posting it releases the performance security — one instrument hands over to the next.

`POST /api/contracts/:id/variation-order`, `/terminate`, `/warranty-security`.

### Blacklisting (Sec. 69)

The sanction that bars a supplier from **all** government procurement. The status and the eligibility check that reads it both existed from the start; the *act* did not, so the only way to blacklist a supplier was to edit the database — precisely the unrecorded change the audit log exists to prevent.

A blacklisting has a **term**: one year for a first offence, two where there is a prior similar offence. It is stored as an end date so the sanction lapses on its own rather than needing somebody to remember. Lifting one restores the status the supplier held *before* the sanction, not an assumed "verified", and the original `blacklistedAt` is kept — it is the record of a prior offence that makes the next one a repeat.

Issued by the **HoPE** (`bidding.award`), not by the Secretariat that reviews accreditations. Barring a firm from every government contract is not a clerical act.

## 9. Role Workspaces
### System Administrator
Primary focus:
- user and department maintenance
- system settings, including the LGU classification and the capitalisation threshold
- bidder account issuance
- audit logs

### HOPE / Mayor
Primary focus:
- the year's development priorities
- endorsing the investment program
- approving the executive budget before it goes to the Sanggunian
- approving purchase requests, APP entries and awards
- decision support and budget visibility

### Municipal Planning and Development Coordinator
Primary focus:
- the Comprehensive Development Plan and its goals
- the Annual Investment Program
- consolidating budget proposals against the development plan
- Local Finance Committee work (budget forum and hearings)

Holds no procurement permission at all — planning what the municipality will do is a different job from buying it.

### Secretary to the Sangguniang Bayan
Primary focus:
- recording the adoption of the development plan and the investment program
- recording the Appropriation Ordinance
- recording the Sangguniang Panlalawigan's review

Decides nothing. This role is the legislature's clerk of record, which is what lets an appropriation be traced to an ordinance rather than to a Budget Officer's keyboard.

### BAC Chairperson
Primary focus:
- evaluation oversight
- bid opening and post-qualification
- awards
- contracts
- conferences

### BAC Member
Primary focus:
- technical and commercial evaluation
- conferences

### BAC Secretariat
Primary focus:
- APP consolidation, and revising or cancelling plan lines when a project changes
- determining the mode of procurement on approved requisitions
- RFQ / ITB publication
- vendor review
- contract drafting
- pending-item coordination

### TWG Member
Primary focus:
- technical evaluation input
- conference participation

### Department Requester
Primary focus:
- preparing and submitting the office's budget proposal
- PPMP / APP creation and submission
- PR creation
- delivery reporting
- workflow follow-up

An office's year starts with the budget proposal, not the APP: it asks for money first, and only plans procurement against what it was granted.

### Budget Officer
Primary focus:
- running the budget calendar and issuing the budget call
- Municipal Budget Council review and Local Finance Committee work
- assembling the executive budget for the Mayor's approval
- maintaining the appropriation register
- certifying the appropriation on requisitions and raising the ORS
- unexpended monitoring and decision support review

Deliberately **cannot** approve the executive budget or enact the ordinance — those belong to the Mayor and the Sanggunian. Holding all three would put the whole authorisation chain in one office.

### Municipal Accountant
Primary focus:
- **obligating the appropriation on requisitions and raising the ORS (step 18b, LGC Sec. 344)**
- certifying invoices and preparing disbursement vouchers
- finance work queue

Never holds `pr.certify`: saying an appropriation exists and making the entry that commits it are two acts by two officers.

### Municipal Treasurer
Primary focus:
- certifying the availability of funds on requisitions (step 16)
- Local Finance Committee work — the income estimate the forum works from is theirs
- releasing disbursements against certified vouchers

Never holds both `payment.certify` and `payment.release`: the officer who certifies a claim must not also hand over the money.

### Vendor / Supplier
Primary focus:
- registration and eligibility
- bid opportunities
- bid submission
- contract signing
- invoice submission

### Observer / Public Auditor
Primary focus:
- published transparency records only

### Internal Auditor
Primary focus:
- full audit trail review
- published and internal record review
- audit export

## 10. API Surface by Module
This is the practical route map for the backend.

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/change-password`, `POST /api/auth/forgot-password`, `GET /api/auth/reset-password/verify`, `POST /api/auth/reset-password`
- `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/reset-password`
- `GET /api/departments`, `POST /api/departments`, `PATCH /api/departments/:id` — administrator only
- `GET /api/departments/directory` — names and codes of active offices, for any signed-in user filling in a form that names one
- `GET /api/planning/options`, `GET|POST /api/planning/plans`, `PATCH /api/planning/plans/:id`
- `POST /api/planning/plans/:id/adopt`, `POST /api/planning/plans/:id/goals`, `PATCH /api/planning/goals/:goalId`
- `POST /api/planning/priorities`
- `GET|POST /api/planning/investment-programs`, `POST /api/planning/investment-programs/:id/entries`
- `POST /api/planning/investment-programs/:id/transition`, `GET /api/planning/aip-entries`
- `GET /api/budget-preparation/options`, `GET|POST /api/budget-preparation/budgets`, `GET /api/budget-preparation/budgets/:id`
- `POST /api/budget-preparation/budgets/:id/transition`, `POST /api/budget-preparation/budgets/:id/proceedings`
- `GET|POST /api/budget-preparation/proposals`, `PATCH /api/budget-preparation/proposals/:id`
- `POST /api/budget-preparation/proposals/:id/{submit,review,finalise,return}`
- `GET /api/app-entries`, `POST /api/app-entries`, `PATCH /api/app-entries/:id`, `POST /api/app-entries/:id/transition`
- `GET /api/purchase-requisitions`, `POST /api/purchase-requisitions`, `PATCH /api/purchase-requisitions/:id`
- `POST /api/purchase-requisitions/:id/transition`, `GET /api/purchase-requisitions/:id/mode-suggestion`
- `GET /api/bidding/*` for RFQs, bids, evaluations, and awards
- `POST /api/bidding/awards/:id/disapprove`, `GET /api/bidding/rfqs/:id/abstract`
- `GET /api/observers/options`, `GET|POST /api/observers/organizations`
- `GET /api/observers/invitations`, `POST /api/observers/rfqs/:rfqId/invitations`
- `GET /api/observers/rfqs/:rfqId/coverage`, `GET /api/observers/rfqs/:rfqId/summary`
- `POST /api/observers/invitations/:id/attendance`, `POST /api/observers/invitations/:id/report`
- `GET /api/protests`, `GET /api/protests/options`
- `POST /api/protests/rfqs/:rfqId/reconsideration`, `POST /api/protests`, `POST /api/protests/:id/resolve`
- `POST /api/finance/appropriations/reenact` — LGC Sec. 323
- `POST /api/contracts/:id/performance-security`, `POST /api/contracts/:id/notice-to-proceed`
- `POST /api/contracts/:id/variation-order`, `/terminate`, `/warranty-security` — Sec. 71, 68
- `POST /api/vendors/:id/blacklist`, `POST /api/vendors/:id/blacklist/lift` — Sec. 69
- `POST /api/bidding/rfqs/:id/declare-failure` — Sec. 64
- `GET /api/app-entries/contingency`, `POST /api/app-entries/gppb-submission` — Sec. 7.7
- `GET /api/vendors`, `POST /api/vendors/:id/review`, plus vendor self-service endpoints
- `GET /api/conferences`, `POST /api/conferences`, `PATCH /api/conferences/:id`
- `GET /api/contracts`, `POST /api/contracts`, `POST /api/contracts/:id/sign`, delivery endpoints
- `GET /api/finance/invoices`, `POST /api/finance/invoices/:id/certify`, `POST /api/finance/payments/:paymentId/release`
- `GET /api/finance/budget-monitor`, `POST /api/finance/budget-monitor/alerts`
- `GET /api/audit`, `GET /api/audit/export`, `GET /api/audit/timeline/:entityRef/:entityId`
- `GET /api/dss`
- `GET /api/security/overview`, `GET /api/security/alerts` — `security.view`
- `POST /api/security/scan`, `PATCH /api/security/alerts/:id`, `POST /api/security/rebaseline` — `security.manage`
- `GET /api/transparency/*`
- `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`
- `POST /api/documents`, `GET /api/documents`, `GET /api/documents/:id/download`, `DELETE /api/documents/:id`
- `GET /api/doc-generation/templates`, `POST /api/doc-generation/templates`, `POST /api/doc-generation/templates/:id/versions`
- `POST /api/doc-generation/templates/:id/versions/:versionId/activate`, `POST /api/doc-generation/templates/preview`
- `POST /api/doc-generation/documents`, `PATCH /api/doc-generation/documents/:id/body`
- `POST /api/doc-generation/documents/:id/{approve,publish,unpublish,void}`, `GET /api/doc-generation/documents/:id/pdf`
- `GET /api/public/documents`, `GET /api/public/documents/:id/download` — published documents only

## 11. Common Operator Workflow
1. Log in with a seeded account or a real account created by the administrator.
2. The system restores the session and routes the user to the correct role landing page.
3. The user works only inside the modules allowed by their role.
4. Sensitive actions are validated again on the backend with permissions.
5. Audit and transparency records are generated from module activity.
6. Uploaded documents and notifications support the workflow as supporting tools.

Each office is notified when work reaches its desk — the budget call, a proposal awaiting review, a requisition awaiting a signature, an adopted investment program. Recipients are resolved by *permission* rather than by hardcoded role, so the permission matrix stays the single source of truth for who gets told.

## 12. Notes for Maintenance
- `municipal_backend/models/index.js` is the single registration point for Sequelize models.
- `municipal_backend/config/permissionMatrix.js` is the source of truth for role permissions.
- `municipal_backend/seed.js` should be rerun after permission or role changes so demo data stays aligned. It is idempotent-with-updates: re-running corrects drifted settings, departments and role grants rather than skipping them. **Permissions drift silently otherwise** — a role can hold a permission in `permissionMatrix.js` that it does not have in the database.
- `municipal-frontend/src/config/roleLanding.js` and `municipal-frontend/src/config/navigation.js` should stay in sync with seeded roles and backend permissions. Every nav `href` must resolve to a route in `App.jsx` **and** be permitted by that route's `RoleRoute` allow-list; a link that is neither presents as a dead link or a 403. Cross-reference the three files after touching any of them.
- Database configuration is read from the environment (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`) with local development defaults — see §3.
- **Sequelize stores dates in UTC.** Writing a timestamp with MySQL's `NOW()` in a script or a fixture produces a value eight hours out from what the application reads back. Use `UTC_TIMESTAMP()` in raw SQL, or go through the models.

### Three traps when adding a workflow stage
All three have bitten this codebase before.

0. **Never spread `req.body` into `create()` or `update()`.** `status` is a model attribute, so a controller that does `pr.update({ ...req.body })` hands the state machine to whoever can reach the endpoint. This is how a Department Requester could walk a draft requisition to `approved` with forged signatures. Add fields to the explicit whitelist instead — see §8.

1. **The route gate and the state machine must be kept in step.** Every `/:id/transition` route carries its own `requireAnyPermission(...)` list, *separate* from the per-transition permission the controller enforces. A permission missing from that outer list is refused before the controller runs, which presents as "the officer has the permission but still gets a 403". Add the new permission to both, and to the route's `RoleRoute` allow-list in `App.jsx`.

2. **Never retype a list of statuses.** `LIVE_PR_STATUSES` in `services/prWorkflow.js` and `RELEASED_APP_STATUSES` in `services/appWorkflow.js` are derived from the state machines for a reason: when a hand-written copy of the PR status list was not updated after a stage was added, a requisition sitting at that stage stopped counting against its APP entry's balance, and two requisitions could each pass the check for the same money. Import the derived list instead.

## 13. Troubleshooting
### Login fails immediately
Check:
- MySQL is running
- the database name is `municipal_backend`
- the backend is connected to the correct MySQL user and password
- the seed script has been run

### User lands on the wrong page
Check:
- the user role in the database
- the landing map in `municipal-frontend/src/config/roleLanding.js`
- the role guard rules in `municipal-frontend/src/routes/RoleRoute.jsx`

### A page opens in the frontend but the API returns 403
This usually means the frontend route is visible but the backend permission is missing. Update the role permission matrix and reseed the permission table if that change is intentional.

### Uploaded files or documents do not appear
Check:
- backend document routes
- the upload middleware
- the file storage path in the document service

### "No adopted Annual Investment Program for &lt;year&gt;"
A budget cannot be opened for a year that has no adopted AIP — the projects it appropriates for have to exist first. Work back up the chain: is there an **adopted** development plan covering the year, has the Mayor set priorities, has the Planning Office prepared the programme, and has the Sanggunian's secretary recorded its adoption?

### An appropriation exists but a requisition cannot be certified against it
The appropriation must be `enacted`, not `draft`. Lines released by an enacted executive budget are enacted automatically; lines keyed directly into the register start as drafts.

### A capital item is refused on a requisition
The appropriation behind the linked APP entry is not Capital Outlay. An item with a useful life beyond one year and a unit cost at or above the capitalisation threshold cannot be charged to MOOE. Either charge it to a Capital Outlay line, or check whether the useful-life box was ticked in error.

## 14. Short Summary
This system covers the whole municipal chain: development planning, budget preparation and legislation, procurement planning, requisitioning, bidding, contracts, delivery, payment, budget monitoring, audit logging, and transparency reporting. Its central claim is traceability — every peso spent can be walked back through the requisition, the appropriation, the budget proposal, the investment programme and the development goal that authorised it, and every act along the way is recorded in a hash-chained append-only audit log. The backend owns security and persistence; the frontend provides role-specific workspaces.
