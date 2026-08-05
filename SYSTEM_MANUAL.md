# Municipal Budgeting and Procurement Workflow Manual

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
4. Departments prepare Project Procurement Management Plans (PPMPs).
5. Consolidate PPMPs into the Annual Procurement Plan (APP).

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
19. The BAC determines the mode of procurement.
20. Procurement proceeds through competitive bidding or another legally authorised mode.

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

The database connection in `municipal_backend/models/db.js` is currently:
- database: `municipal_backend`
- user: `root`
- password: empty string
- host: `localhost`
- dialect: `mysql`

So MySQL must be running locally and the credentials must match that file unless you change it.

### Frontend
Frontend scripts are defined in `municipal-frontend/package.json`:
- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build.
- `npm run lint` runs ESLint.
- `npm run preview` previews the production build.

### Typical local run order
1. Start MySQL.
2. Run the backend migrate script.
3. Run the backend seed script.
4. Start the backend server.
5. Start the frontend dev server.
6. Open the frontend and log in with a seeded account.

## 4. Authentication and Access Control
### Login flow
The frontend loads the current user through the auth context in `municipal-frontend/src/context/AuthContext.jsx`.
- On app load, it calls the backend `me` endpoint.
- If no user is active, the app redirects to `/login`.
- On successful login, the user is routed to a role-specific landing page.

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
- **Bids and Awards Committee** — already modelled through the BAC roles; the mode determination is held by the Chairperson and the Secretariat.

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

### 7.9 Notifications and Documents
The system also supports:
- notification inbox and read status
- document upload, download, and deletion

Backend routes:
- `/api/notifications`
- `/api/documents`

## 8. The End-to-End Workflow
This is the full path the system implements, in the order the municipality performs it. Every status change goes through a centralised state machine — there are no direct status writes anywhere in the codebase, so a stage cannot be skipped.

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

### Steps 4–5: PPMP lines and the APP
A department files its PPMP line against **both** an enacted appropriation and a live AIP entry. The BAC Secretariat consolidates it into the indicative APP, the Budget Officer certifies, and the Mayor approves — at which point it is marked final and locked.

```
draft → pendingConsolidation → pendingBudgetCertification → pendingHopeApproval → approved (locked)
```

The plan stage advances with the workflow: `ppmp` → `indicativeApp` → `finalApp`.

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
  → pendingBudgetCertification         Budget Office certifies the appropriation,
                                       names the funding source, raises the ORS (step 18)
  → pendingModeDetermination           BAC determines the mode of procurement (step 19)
  → approved                           cleared for procurement               (step 20)
```

> **Note on ordering.** An earlier build ran Budget → Treasury → Secretariat → Mayor, reasoning from LGC Sec. 344. That section governs **disbursement** — the voucher stage, which this system implements separately — not the requisition. The order above is the LGU's actual practice, and it is also the safer one: obligating an appropriation before the Mayor has approved the request means every refused requisition silently holds budget in the meantime. The reasoning is recorded in full at the top of `services/prWorkflow.js`.

The two certifications remain separate officers answering separate questions and must never be merged. The Treasurer answers "is the cash there?"; the Budget Officer answers "is there an appropriation, and is there room left under it?". An appropriation can be intact while collections have not come in — which is exactly the case the Treasurer's signature exists to catch.

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

### Award recommendation and approval
After evaluation, the BAC Chairperson recommends the award and HOPE approves it.

Backend:
- `POST /api/bidding/bids/:bidId/recommend-award`
- `POST /api/bidding/awards/:id/approve`
- `GET /api/bidding/awards`

This is where the Notice of Award is generated.

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
After NOA approval, the workflow continues into contract drafting, signature, delivery reporting, and invoice processing.

Frontend:
- Contracts
- Deliveries
- Live Conference

Backend:
- `GET /api/contracts`
- `POST /api/contracts`
- `POST /api/contracts/:id/issue`
- `POST /api/contracts/:id/sign`
- `GET /api/contracts/deliveries/all`
- `POST /api/contracts/:id/deliveries`

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
- certifying invoices and preparing disbursement vouchers
- finance work queue

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
- `GET /api/vendors`, `POST /api/vendors/:id/review`, plus vendor self-service endpoints
- `GET /api/conferences`, `POST /api/conferences`, `PATCH /api/conferences/:id`
- `GET /api/contracts`, `POST /api/contracts`, `POST /api/contracts/:id/sign`, delivery endpoints
- `GET /api/finance/invoices`, `POST /api/finance/invoices/:id/certify`, `POST /api/finance/payments/:paymentId/release`
- `GET /api/finance/budget-monitor`, `POST /api/finance/budget-monitor/alerts`
- `GET /api/audit`, `GET /api/audit/export`, `GET /api/audit/timeline/:entityRef/:entityId`
- `GET /api/dss`
- `GET /api/transparency/*`
- `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`
- `POST /api/documents`, `GET /api/documents`, `GET /api/documents/:id/download`, `DELETE /api/documents/:id`

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
- `municipal_backend/seed.js` should be rerun after permission or role changes so demo data stays aligned. It is idempotent-with-updates: re-running corrects drifted settings, departments and role grants rather than skipping them.
- `municipal-frontend/src/config/roleLanding.js` and `municipal-frontend/src/config/navigation.js` should stay in sync with seeded roles and backend permissions.
- The current database connection is hardcoded in `municipal_backend/models/db.js`, so deployment requires updating that file or replacing it with environment-based configuration.

### Two traps when adding a workflow stage
Both have bitten this codebase before.

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
