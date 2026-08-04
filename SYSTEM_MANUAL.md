# APP to Notice of Award Workflow Manual

## 1. Purpose
This system is a role-based municipal procurement platform for planning, requisitioning, bidding, contracting, delivery tracking, invoicing, budget monitoring, audit review, and transparency publishing.

This manual focuses on the end-to-end flow from Annual Procurement Plan (APP) entry to Notice of Award (NOA), then onward to contract and delivery handling.

It is split into two applications:
- `municipal_backend`: an Express + Sequelize backend with MySQL, session auth, permissions, and a server-rendered home page.
- `municipal-frontend`: a React + Vite front end that provides role-specific dashboards and workflow screens.

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
- BAC Chairperson -> `/bac-chair`
- BAC Member -> `/bac-member`
- BAC Secretariat -> `/secretariat`
- TWG Member -> `/twg`
- Department Requester -> `/dashboard`
- Budget Officer -> `/budget`
- Finance Officer -> `/finance`
- Vendor / Supplier -> `/supplier`
- Observer / Public Auditor -> `/transparency`
- Internal Auditor -> `/audit`

## 6. Seed Data
The seed script creates the core reference data needed to use the system.

### Seeded roles
- System Administrator
- HOPE (Municipal Mayor)
- BAC Chairperson
- BAC Member
- BAC Secretariat
- TWG Member
- Department Requester
- Budget Officer
- Finance Officer
- Vendor / Supplier
- Observer / Public Auditor
- Internal Auditor

### Seeded departments
The seed includes common municipal offices such as:
- Office of the Mayor
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

These settings affect procurement thresholds and system displays.

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

### 7.2 Annual Procurement Plan and Purchase Requisitions
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

### 7.3 Bidding and Vendor Verification
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

### 7.4 Contracts and Deliveries
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

### 7.5 Budget and Finance
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

### 7.6 Audit and Transparency
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

### 7.7 Notifications and Documents
The system also supports:
- notification inbox and read status
- document upload, download, and deletion

Backend routes:
- `/api/notifications`
- `/api/documents`

## 8. APP to Notice of Award Workflow
This is the main procurement path the system implements.

### Step 1: Create APP entries
The Department Requester starts in the APP module and creates or updates procurement items for the department.

Frontend:
- APP Entries

Backend:
- `GET /api/app-entries`
- `POST /api/app-entries`
- `PATCH /api/app-entries/:id`
- `POST /api/app-entries/:id/transition`

Key roles:
- Department Requester
- BAC Secretariat
- Budget Officer
- HOPE

### Step 2: Consolidate and certify the APP
The APP moves through submission, consolidation, certification, and approval depending on the role and current status.

Typical handoff order:
1. Department Requester submits the APP line.
2. BAC Secretariat consolidates department submissions.
3. Budget Officer certifies funding.
4. HOPE gives final approval.

The controller enforces the state machine, so the allowed transition depends on the current APP status.

### Step 3: Create the Purchase Requisition
Once the APP has support, the Department Requester or authorized office creates the Purchase Requisition.

Frontend:
- Purchase Requisitions

Backend:
- `GET /api/purchase-requisitions`
- `POST /api/purchase-requisitions`
- `PATCH /api/purchase-requisitions/:id`
- `POST /api/purchase-requisitions/:id/transition`
- `GET /api/purchase-requisitions/app-balance/:appEntryId`

This stage checks the remaining APP balance while the requisition is being prepared.

### Step 4: Publish the RFQ or ITB
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

### Step 5: Receive bids and evaluate
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

### Step 6: Recommend and approve the award
After evaluation, the BAC Chairperson recommends the award and HOPE approves it.

Backend:
- `POST /api/bidding/bids/:bidId/recommend-award`
- `POST /api/bidding/awards/:id/approve`
- `GET /api/bidding/awards`

This is where the Notice of Award is generated.

### Step 7: Issue the Notice of Award
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

### Step 8: Proceed to contract and delivery
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
- system settings
- audit logs

### HOPE / Mayor
Primary focus:
- final approvals
- decision support
- budget visibility
- award approvals

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
- APP consolidation
- PR review
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
- APP creation and submission
- PR creation
- delivery reporting
- workflow follow-up

### Budget Officer
Primary focus:
- budget certification
- APP funding checks
- unexpended monitoring
- decision support review

### Finance Officer
Primary focus:
- invoice processing
- payment release
- finance work queue

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

## 9. API Surface by Module
This is the practical route map for the backend.

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/auth/change-password`, `POST /api/auth/forgot-password`, `GET /api/auth/reset-password/verify`, `POST /api/auth/reset-password`
- `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/reset-password`
- `GET /api/departments`, `POST /api/departments`, `PATCH /api/departments/:id`
- `GET /api/app-entries`, `POST /api/app-entries`, `PATCH /api/app-entries/:id`
- `GET /api/purchase-requisitions`, `POST /api/purchase-requisitions`, `PATCH /api/purchase-requisitions/:id`
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

## 10. Common Operator Workflow
1. Log in with a seeded account or a real account created by the administrator.
2. The system restores the session and routes the user to the correct role landing page.
3. The user works only inside the modules allowed by their role.
4. Sensitive actions are validated again on the backend with permissions.
5. Audit and transparency records are generated from module activity.
6. Uploaded documents and notifications support the workflow as supporting tools.

## 11. Notes for Maintenance
- `municipal_backend/models/index.js` is the single registration point for Sequelize models.
- `municipal_backend/config/permissionMatrix.js` is the source of truth for role permissions.
- `municipal_backend/seed.js` should be rerun after permission or role changes so demo data stays aligned.
- `municipal-frontend/src/config/roleLanding.js` and `municipal-frontend/src/config/navigation.js` should stay in sync with seeded roles and backend permissions.
- The current database connection is hardcoded in `municipal_backend/models/db.js`, so deployment requires updating that file or replacing it with environment-based configuration.

## 12. Troubleshooting
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

## 13. Short Summary
This system is a municipality-focused procurement workflow platform with session login, role-based access control, budgeting, bidding, contracts, finance, audit logging, and transparency reporting. The backend owns security and persistence, while the frontend provides role-specific workspaces and dashboards.
