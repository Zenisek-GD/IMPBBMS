# Evaluation Deployment & Reset Guide

This guide deploys an isolated evaluation instance of **ProcureNance** on the **same EC2 server** under a separate subdomain (for example, `demo.procurenance.online`) using its own MySQL database (`municipal_survey_demo`) and backend port (`3001`).

Your live production database (`municipal_backend`) and live site (`procurenance.online`) stay completely untouched.

---

## 1. What Is Included in the Evaluation Database

Running `npm run seed:survey -- --confirm-database municipal_survey_demo` creates a fresh, self-consistent FY 2026 dataset for the **Municipality of Roxas, Oriental Mindoro** with:

- **19 Role Accounts** across all 17 system roles (including a complete **5-member BAC committee** so BAC quorum checks pass with zero warnings), all sharing password **`Passw0rd!`** with **2FA turned off by default**.
- **Separate Account Emails**: Uses `@roxas-lgu.ph` and `supplier@medlinetrading.ph` — never overlaps with live production emails.
- **Shared-Account Lockout Protection (`SURVEY_SANDBOX_MODE=true`)**: Prevents evaluators from accidentally changing passwords, resetting credentials, deactivating, or turning on mandatory 2FA for the 19 built-in role accounts (while still allowing them to create and edit *new* user accounts).
- **3 Published Projects (1 Completed + 2 Ongoing)** — completely clean municipal records with genuine PDF attachments, verified SHA-256 audit chain, and zero "demo/mock/seeded" wording anywhere:
  1. **Completed (`HEALTH`, Goods, Competitive Bidding)**: *Supply and Delivery of Diagnostic Laboratory Equipment for the Rural Health Unit* (`PAP-HLTH-2026-004`, ABC ₱2,450,000, Contract ₱2,318,000, Paid with BIR EWT + VAT withholding, Financial Closeout approved with ₱132,000 contract savings).
  2. **Ongoing #1 (`IT`, Goods, Competitive Bidding — Bid Evaluation & Award Stage)**: *Supply and Delivery of Network Switches, Desktop Workstations, and Backup Power Units for Municipal Offices* (`PAP-IT-2026-009`, ABC ₱1,850,000, 3 bids opened, TWG assessments compliant, 1 BAC evaluation submitted — ready for BAC evaluators to submit reviews, finalize evaluation, post-qualify, and recommend/approve award).
  3. **Ongoing #2 (`ENGR`, Goods, Competitive Bidding — Contract, Delivery & Payment Stage)**: *Supply and Delivery of Solar Streetlights and Electrical Fixtures for Barangay Poblacion* (`PAP-ENGR-2026-012`, ABC ₱1,850,000, Phase 1 PR ₱1,600,000 leaving ₱250,000 remaining APP balance so requesters can create a new PR immediately; Active Contract ₱1,540,000 with Tranche 1 Accepted + Invoice `INV-2026-0002` awaiting Accounting certification & Treasury payment release, and Tranche 2 Delivery reported awaiting Inspection & Acceptance).
- **Ready-to-Use Planning & Budget Cushion**: Adopted Comprehensive Development Plan (2024–2029), FY 2026 Annual Investment Program, enacted FY 2026 Appropriations with spare balances, and 1 internal Draft APP entry (`PAP-ENGR-2026-018`) ready to approve inside the APP module without altering the 3-project public count.

---

## 2. Deployment Steps for EC2 (Hand This Section to ChatGPT)

> **Important safety rule**: Never point this deployment's `.env` at `municipal_backend`. Always use a dedicated database such as `municipal_survey_demo`. The `seed:survey` script explicitly refuses to run against `municipal_backend`.

### Step A — DNS Record
Create an **A** record (or CNAME) in your DNS provider (e.g. Cloudflare / Route 53) pointing:
- `demo.procurenance.online` → your existing EC2 server public IP.

### Step B — Pull Latest Code & Build Frontend (If Not Already Built)
On the EC2 server, pull the latest branch into a separate directory (recommended, e.g. `/srv/procurenance-demo` or `/home/ubuntu/procurenance-demo`) so its `.env` is 100% separate from production:

```bash
git clone https://github.com/Zenisek-GD/IMPBBMS.git /home/ubuntu/procurenance-demo
cd /home/ubuntu/procurenance-demo/municipal_backend
npm ci --omit=dev
cd ../municipal-frontend
npm ci
npm run build
```

*(If reusing the existing checkout's built `municipal-frontend/dist`, ensure `/api` proxies to `127.0.0.1:3001` for `demo.procurenance.online`.)*

### Step C — Create Isolated MySQL Database & User
Create a dedicated MySQL database and (recommended) a dedicated MySQL user with privileges **only** on `municipal_survey_demo`:

```sql
CREATE DATABASE IF NOT EXISTS municipal_survey_demo
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'procurenance_demo'@'127.0.0.1'
  IDENTIFIED BY '<STRONG_DEMO_DB_PASSWORD>';

GRANT ALL PRIVILEGES ON municipal_survey_demo.* TO 'procurenance_demo'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### Step D — Configure `/home/ubuntu/procurenance-demo/municipal_backend/.env`
Generate two independent 64-char hex secrets (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`):

```env
NODE_ENV=production
PORT=3001
LISTEN_HOST=127.0.0.1
FRONTEND_ORIGIN=https://demo.procurenance.online

SESSION_SECRET=<GENERATE_NEW_64_HEX_SECRET_1>
MFA_ENCRYPTION_KEY=<GENERATE_NEW_64_HEX_SECRET_2>

REQUIRE_INITIAL_PASSWORD_RESET=false
SURVEY_SANDBOX_MODE=true

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=municipal_survey_demo
DB_USER=procurenance_demo
DB_PASSWORD=<STRONG_DEMO_DB_PASSWORD>

# Reuse existing production SMTP settings (required by NODE_ENV=production config check)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<EXISTING_SMTP_USER>
SMTP_PASSWORD=<EXISTING_SMTP_APP_PASSWORD>
MAIL_FROM_NAME=Municipality of Roxas Procurement
MAIL_FROM_ADDRESS=<EXISTING_SMTP_USER>

ACTIVATION_TOKEN_TTL_HOURS=48
OTP_TTL_MINUTES=5
```

### Step E — Run Migrations and Seed the Evaluation Database
```bash
cd /home/ubuntu/procurenance-demo/municipal_backend
npm run migrate
npm run migrate -- --check
npm run seed:survey -- --confirm-database municipal_survey_demo
```

Verify the JSON summary prints:
- `"accounts": 19`
- `"bacCommitteeSize": 5`
- `"auditChainIntact": true`
- `"integrityFindings": 0`

### Step F — Start Dedicated Backend Process (Port 3001)
Using PM2 or systemd (do **not** touch the existing production service on port 3000):

```bash
# Example with systemd (/etc/systemd/system/procurenance-demo.service)
# WorkingDirectory=/home/ubuntu/procurenance-demo/municipal_backend
# ExecStart=/usr/bin/node index.js
# Restart=always
```

Or with PM2:
```bash
cd /home/ubuntu/procurenance-demo/municipal_backend
pm2 start index.js --name procurenance-demo
pm2 save
```

### Step G — Configure Nginx Reverse Proxy + HTTPS for `demo.procurenance.online`
Create `/etc/nginx/sites-available/demo.procurenance.online`:

```nginx
server {
    listen 80;
    server_name demo.procurenance.online;

    root /home/ubuntu/procurenance-demo/municipal-frontend/dist;
    index index.html;

    client_max_body_size 15m;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable the site, verify Nginx config, reload, and issue TLS via Certbot:
```bash
sudo ln -s /etc/nginx/sites-available/demo.procurenance.online /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d demo.procurenance.online
```

### Step H — Post-Deploy Smoke Check
1. Open `https://demo.procurenance.online` — verify **3 published projects** (`1 Completed`, `2 Ongoing`) appear on the Public Portal.
2. Sign in as `admin@roxas-lgu.ph` / `Passw0rd!` — verify login goes straight to the dashboard with **no 2FA prompt**.
3. Open **Security & Integrity Console** — verify **Audit Chain Intact** and **0 tampering alerts**.
4. Open **System Settings → Procurement Policy** — verify **5/5 BAC signatories designated, 0 warnings**.
5. Confirm `https://procurenance.online` is completely unaffected.

---

## 3. Resetting Between IT Expert Evaluators (2-Second Reset)

Anytime evaluators finish testing and you want the system reset cleanly back to its original 1 Completed + 2 Ongoing baseline:

```bash
cd /home/ubuntu/procurenance-demo/municipal_backend
npm run seed:survey -- --confirm-database municipal_survey_demo
```

*(Optional: you can also schedule this nightly via `cron` if multiple batches of evaluators test on consecutive days.)*

---

## 4. IT Expert Evaluator Account Credentials

All accounts share the same password: **`Passw0rd!`** (2FA is turned off for direct evaluation access).

| Role | Official Name | Department | Login Email |
| :--- | :--- | :--- | :--- |
| **System Administrator** | Joel R. Fabricante | IT Office | `admin@roxas-lgu.ph` |
| **HOPE (Municipal Mayor)** | Engr. Jerwin S. Dimapilis | Office of the Mayor | `mayor@roxas-lgu.ph` |
| **BAC Chairperson** | Atty. Rodel V. Manalo | Bids & Awards Committee | `bac.chair@roxas-lgu.ph` |
| **BAC Vice-Chairperson** | Engr. Arturo M. Beltran | Bids & Awards Committee | `bac.vice@roxas-lgu.ph` |
| **BAC Member (Primary)** | Engr. Cristina P. Bautista | Bids & Awards Committee | `bac.member@roxas-lgu.ph` |
| **BAC Member 2** | Arch. Danilo G. Reyes | Bids & Awards Committee | `bac.member2@roxas-lgu.ph` |
| **BAC Member 3** | Ma. Lourdes V. Salazar | Bids & Awards Committee | `bac.member3@roxas-lgu.ph` |
| **BAC Secretariat** | Marilou D. Ceniza | BAC Secretariat | `bac.secretariat@roxas-lgu.ph` |
| **TWG Member** | Engr. Noel A. Villamor | Technical Working Group | `twg@roxas-lgu.ph` |
| **Head of Office** | Engr. Roberto C. Soriano | Engineering (Head of ENGR/GSO/HEALTH/IT) | `office.head@roxas-lgu.ph` |
| **Department Requester** | Dr. Anna Liza R. Cortez | Municipal Engineering Office | `requester@roxas-lgu.ph` |
| **Budget Officer** | Elena S. Villaflor | Municipal Budget Office | `budget@roxas-lgu.ph` |
| **Planning Officer (MPDC)** | Engr. Ferdinand T. Morales | Planning & Development Office | `planning@roxas-lgu.ph` |
| **Sanggunian Secretary** | Atty. Clarissa P. Mendoza | Office of the Sangguniang Bayan | `sanggunian@roxas-lgu.ph` |
| **Municipal Accountant** | Ramon T. Delos Reyes | Municipal Accounting Office | `accountant@roxas-lgu.ph` |
| **Municipal Treasurer** | Lorna F. Aguinaldo | Municipal Treasurer's Office | `treasurer@roxas-lgu.ph` |
| **Internal Auditor** | Grace B. Mendoza | Internal Audit Service | `auditor@roxas-lgu.ph` |
| **Observer / Public Auditor** | Fr. Antonio L. Perez | External (MFPO) | `observer@roxas-lgu.ph` |
| **Vendor / Supplier** | Medline Diagnostics Trading Corp. | External (Verified Supplier) | `supplier@medlinetrading.ph` |

### Quick Test Workflows for Evaluators
- **Public Citizen View (No Login)**: Browse the 3 projects (`1 Completed`, `2 Ongoing`), inspect the 8-stage transparency timeline, and download attached ITB PDF documents.
- **BAC & Award Flow (`bac.chair@roxas-lgu.ph` → `mayor@roxas-lgu.ph`)**: Open `ITB-2026-0002` (Municipal Workstations & Network Switches), review TWG & blind evaluations, finalize evaluation (select 3 of 5 BAC members for quorum), complete post-qualification, and issue Notice of Award.
- **Delivery, Inspection & Payment Flow (`office.head@roxas-lgu.ph` → `accountant@roxas-lgu.ph` → `treasurer@roxas-lgu.ph`)**: Inspect Tranche 2 Delivery on `CTR-2026-0002` (Solar Streetlights), certify submitted Invoice `INV-2026-0002` (auto-computing BIR EWT + GMP VAT withholdings), and release the Disbursement Voucher.
- **New Purchase Requisition Flow (`requester@roxas-lgu.ph` → `office.head@roxas-lgu.ph`)**: Create a brand-new Purchase Requisition against `PAP-ENGR-2026-012` (₱250,000 remaining APP balance) and submit for department head endorsement.
- **Audit & Tamper-Evidence Review (`admin@roxas-lgu.ph` or `auditor@roxas-lgu.ph`)**: Inspect the hash-chained Audit Trail and run an Integrity Verification scan in the Security Console.
