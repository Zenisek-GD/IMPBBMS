# Data Privacy and Security — Assessment and Corrected Documentation

**System:** Procurenance — Municipal Procurement and Budgeting System
**Assessed:** 13 August 2026
**Purpose:** to state accurately what the system does, what it does not, and what should be said in the written documentation instead.

---

## Why this document exists

The security section as drafted describes a different system from the one that was built. It claims a permissioned blockchain with Byzantine Fault Tolerant consensus, hardware security modules, client-side encryption of bid documents, and digital signatures. None of those are present, and none of them are close to present — they are not partial implementations, they are absent.

This matters beyond accuracy. A panel that asks *"show me the BFT consensus"* and is shown nothing has been given a reason to doubt every other claim in the section, including the many that are true and well built. The strongest position at a defence is a section that claims less and can demonstrate all of it.

What follows is organised in three parts:

- **Part A** — the claims that are true, with where each one lives so it can be shown on request.
- **Part B** — the claims that are not true, each with replacement wording.
- **Part C** — recommendations on what to add, ranked by what actually raises this system's security.

---

# PART A — What the system genuinely implements

### A1. Role-Based Access Control ✅ *fully implemented*

A single permission matrix (`municipal_backend/config/permissionMatrix.js`) is the sole source of truth for who may do what. It defines **17 roles** and **76 discrete permissions**, and every protected route names the permission it requires.

Two corrections to the role list in the draft. The system has no role called *Finance Officer* — the finance function is split between the **Municipal Accountant** and the **Municipal Treasurer**, which is how LGC Sec. 344 divides it. And *COA/GPPB Observer* is simply **Observer** in the system, covering the civil-society and professional-body observers of RA 12009 Sec. 43.

The full list: System Administrator, HOPE (Municipal Mayor), Planning Officer (MPDC), Sanggunian Secretary, BAC Chairperson, BAC Vice-Chairperson, BAC Member, BAC Secretariat, TWG Member, Head of Office, Department Requester, Budget Officer, Municipal Accountant, Municipal Treasurer, Vendor/Supplier, Observer, Internal Auditor.

Enforcement is server-side. The interface hides actions a user cannot perform, but that is presentation only — the check that matters runs on the server on every request, and a caller who forges a request past the interface receives `403` with the permission they lacked.

### A2. Multi-Factor Authentication ✅ *fully implemented — and broader than claimed*

The draft says MFA is required "for BAC members and oversight users". Understated: **every account in the system must enrol a second factor**, including vendors. An account that has not enrolled can sign in with its password but is confined to the enrolment screen and can reach no other part of the system.

- Time-based one-time passwords to **RFC 6238**, implemented in `services/totp.js` — SHA-1 HMAC, 6 digits, 30-second step, ±1 step tolerance for clock drift.
- The implementation is **verified against the test vectors published in RFC 6238 Appendix B** (`services/totp.test.mjs`, 17 assertions, all passing). This is worth stating in the documentation: it is objective evidence that the algorithm is correct, not merely that it appears to work.
- Works with any standard authenticator — Google Authenticator, Microsoft Authenticator, Authy — enrolled by QR code.
- Authenticator secrets are encrypted at rest with **AES-256-GCM**; the key is derived by scrypt from a secret held in environment configuration, never in the database.
- Replay is blocked: each accepted code's time-step is recorded, and the same code cannot be presented twice.
- Five consecutive failures lock the second factor for 15 minutes.
- Ten single-use recovery codes are issued at enrolment, stored only as SHA-256 hashes.

### A3. Audit Log Integrity ✅ *fully implemented*

Every consequential action writes an entry to an append-only log (`services/auditLog.js`). The log is **hash-chained**: each entry stores a SHA-256 digest over its own canonical content plus the previous entry's hash. Altering or removing any historical entry breaks every hash after it, and the break is detectable at a known position.

Three details worth citing, because they are where naïve implementations of this fail:

- **Canonical serialisation.** Key order is fixed and nested objects are serialised with sorted keys, because MySQL does not preserve key order in JSON columns — without this, an untouched entry would fail verification after a storage round-trip.
- **Timestamp precision.** Timestamps are truncated to whole seconds before both hashing and storage, because MySQL `DATETIME` silently drops milliseconds — hashing must cover exactly what is persisted.
- **Serialised writes.** Entries are written through a queue inside a transaction, so two concurrent actions cannot claim the same sequence number and fork the chain.

Credentials can never enter the log: passwords, one-time codes, tokens and secrets are stripped on the way in by key-name matching, and replaced with `[redacted]` rather than removed, so a reviewer can see that a field was present and deliberately withheld.

The Internal Auditor can verify the whole chain on demand from the Audit Trail screen.

### A4. Data Anomaly Detection ✅ *implemented — this is the system's strongest security feature*

This is now built, and it goes beyond what the draft claimed. It answers a question the audit log cannot answer on its own.

**The problem it solves.** The hash chain proves nothing *recorded* has been altered. It cannot notice a change that was never recorded in the first place. Somebody with a MySQL client — a developer, a contractor, an attacker who reached the database rather than the application — can raise an appropriation, grant themselves a permission, or delete an award, and the application will never know. The audit log stays perfectly intact and perfectly silent, because nothing asked it to write anything.

**The insight it exploits.** Every legitimate change goes through the application, and the application fingerprints the row as it writes it. So three conditions each mean the same thing — a change that bypassed the system:

| Condition | Meaning |
|---|---|
| Row present, fingerprint no longer matches | Record **altered** outside the system |
| Row present, no fingerprint at all | Record **inserted** outside the system |
| Fingerprint present, row gone | Record **deleted** outside the system |

**What is watched.** Ten tables, by their *material* columns — the ones whose alteration changes what the record means: appropriations, obligations, purchase requisitions, awards, bids, contracts, payments, users (including the password hash), vendors, and APP entries. Role grants are fingerprinted separately, one fingerprint per role over its sorted permission set, so a raw `INSERT INTO rolepermissions` is caught. That last case is the highest-value silent attack on a system like this: it steals nothing directly, it makes everything else stealable.

**Behavioural rules** run over the audit log alongside the integrity sweep:

| Rule | What it catches |
|---|---|
| Audit chain verification | An entry altered or removed after it was written |
| Repeated sign-in failures | Password guessing against one account; scanning across many |
| Repeated second-factor failures | Distinguishes wrong codes from **reused** codes, which indicate interception |
| Role and permission changes | Any change to what a role may do |
| Administrator second-factor resets | The textbook account-takeover route |
| Off-hours consequential acts | Awards, releases and payments outside office hours |
| Bulk document access | Volume downloads — what bulk extraction looks like |
| Identical bid documents | Byte-identical files from different bidders — evidence of collusion |
| Bid IP clustering | One party behind more than one bidder |

**Alerting.** Findings are raised as alerts with a severity, deduplicated so a recurring finding increments a counter rather than burying new ones, and given a lifecycle — open, acknowledged, resolved, dismissed. Nothing is ever deleted; closing an alert requires a written reason.

Critical and high findings notify the **System Administrator and the Internal Auditor**. The auditor is included deliberately: the administrator is the one person with both the database access to make an unauthorised change and the motive to suppress the alert about it, so they must not be the only recipient. Delivery is scoped narrowly for the same reason — a finding like *"the appropriations table was altered in raw SQL"* must not reach nineteen officers, one of whom may have made the change.

Scans run automatically every 30 minutes and on demand. The console reports **when the last scan ran**, and warns if none has run for two hours — a monitor that has stopped reports "no findings" in exactly the same way a clean system does, and treating those two states alike is how tampering sits undetected for a month.

**It is demonstrable.** `services/integrityMonitor.proof.mjs` makes four unauthorised changes in raw SQL — inflates an appropriation by ₱5,000,000, grants `payment.release` to the Vendor role, deletes a bid, and inserts a fabricated ₱750,000 payment — then shows that **zero audit entries were produced** by any of them, and that the scan catches all four and notifies the administrator. It restores the database afterwards. Run it during the defence:

```bash
node services/integrityMonitor.proof.mjs
```

### A5. Logging and Tracking ✅ *implemented* (minus the blockchain)

Comprehensive activity logging exists as described in A3 — sign-ins, document access, administrative actions, and every workflow transition, each with actor identity, role, IP address, outcome, and before/after state. The Internal Auditor can filter, search, inspect any entry, trace the full timeline of any single record, and export to CSV.

### A6. Session Timeout ✅ *implemented, and genuinely role-dependent*

The draft's claim that session duration is "configurable based on user role" is accurate:

- **30 minutes** of inactivity for all internal officers — the common ceiling for privileged applications.
- **8 hours** for vendors and observers, who interact less often and from less controlled environments.

A warning appears two minutes before expiry; any activity resets the timer. Cookies are `httpOnly` and `sameSite=lax`, and carry the `secure` flag when `NODE_ENV=production`.

### A7. Input Validation and Sanitisation ✅ *implemented*

- **SQL injection** — every query goes through Sequelize with bound parameters. No user input is concatenated into SQL anywhere in the codebase.
- **Cross-site scripting** — rich-text content passes through an allow-list sanitiser (`services/htmlSanitizer.js`) that permits only known-safe tags, attributes and CSS properties, and strips `<script>`, `<style>` and `<iframe>` *with their contents*. Sanitisation runs **after** placeholder substitution, so injected content cannot arrive through a template variable.
- **File uploads** — an **allow-list** of seven types (PDF, JPEG, PNG, DOC, DOCX, XLS, XLSX), 10 MB ceiling, one file per request. The declared MIME type and the file extension must agree. SVG and HTML are deliberately excluded: both can carry script, and a browser rendering one served from our own origin would execute it as us. Filenames are stripped of path components and header-injection characters.
- **PDF generation** — the renderer intercepts and aborts every network request except `data:` URLs, so a crafted template cannot make the server fetch an internal address (SSRF).

One correction: the draft says the system "scans for malicious content". It validates structure and type; it does **not** scan file contents for malware. See C4.

### A8. Network Security — Rate Limiting ✅ *implemented*

Twenty-two independently configured rate-limit buckets, tuned per endpoint by sensitivity: sign-in 10 per window, password reset 5, MFA challenge 12, public messages 5, public reads 600. This is real protection against credential stuffing and brute force.

One correction: the draft says the system "monitors network traffic for unusual patterns". It does not — it has no visibility below the application layer. What it does monitor is *application behaviour*, described in A4. See C5.

### A9. Password Storage ✅ *implemented* (not claimed in the draft, but worth claiming)

Passwords are hashed with **bcrypt at cost factor 12** and are never stored, logged, or transmitted in reverse-recoverable form. Password reset uses a one-time code verified against a stored challenge, not a bearer link in an email. This is a genuine strength that the draft omits.

---

# PART B — Claims that are not implemented

Each entry gives the claim as drafted, the reality, and wording that is defensible.

### B1. Blockchain and Byzantine Fault Tolerant consensus ❌ *not implemented*

> *Drafted:* "Critical events are recorded on the blockchain… The permissioned blockchain employs a Byzantine Fault Tolerant (BFT) consensus protocol where only authorized nodes (BAC, COA, DBM) participate in consensus… Critical events are stored both on-chain for immutability and off-chain for detailed forensic analysis."

**Reality:** there is no blockchain, no distributed ledger, no consensus protocol, and no node other than the single application server. Every reference to on-chain storage, consensus, and blockchain hash mismatches must be removed.

**Recommended replacement:**

> The system maintains a tamper-evident audit log secured by a SHA-256 hash chain. Each entry incorporates a cryptographic digest of the entry preceding it, so any alteration or removal of a historical record invalidates every subsequent hash and is detectable at a known position. The chain can be verified on demand by the Internal Auditor. This provides append-only integrity within a single trusted authority — the Municipality — which matches the governance model of a municipal LGU, where no second organisation holds a competing copy of the procurement record.

That last sentence is the important one, and it is worth being ready to say aloud. **Blockchain solves a problem this system does not have.** Distributed consensus exists to establish agreement among parties who do not trust each other and share no common authority. Municipal procurement has a single accountable authority, and COA already holds statutory audit powers over it. A hash chain gives the tamper-evidence that actually matters here; BFT consensus would add operational complexity — multiple nodes, key custody at DBM and COA, an inter-agency governance agreement — for a threat model that does not apply. Presented that way, its absence is a design decision, not a gap.

### B2. Client-side encryption of bid documents ❌ *not implemented*

> *Drafted:* "Bid documents are client-side encrypted before upload, ensuring that even during transmission, data remains confidential."

**Reality:** documents are uploaded over the ordinary request body and stored as **plaintext BLOBs** in MySQL. This was verified directly by reading the `content` column of the documents table, which begins with the literal bytes `%PDF-1.4`. Anyone with database access can read every bid document.

This is the most consequential gap in the list, because sealed bids are exactly the data that must stay confidential until opening, and the whole integrity of a competitive bidding round depends on it. See **C1** — it is the first thing to fix.

**Recommended replacement (accurate to the system as it stands):**

> Bid documents are transmitted over the network and held in the database with access restricted by role: sealed financial proposals are readable only after the BAC records the bid opening, and every access is logged with the identity of the accessor. Each document's SHA-256 checksum is recorded on upload, so any later alteration of the stored file is detectable.

The checksum part is true and worth keeping — it is what makes the duplicate-bid-document detection in A4 possible.

### B3. AES-256 encryption of all data at rest ⚠️ *partially implemented — the claim overstates it*

> *Drafted:* "The system encrypts all sensitive data both at rest and in transit using AES-256 encryption for stored data."

**Reality:** AES-256-GCM is genuinely implemented, but its scope is narrow — it protects **authenticator secrets only**. Application data, including bid documents, financial proposals and eligibility records, is stored unencrypted. Passwords are bcrypt-hashed, which is stronger than encryption for that purpose but is not encryption and should not be described as such.

**Recommended replacement:**

> Authentication credentials receive dedicated cryptographic protection: passwords are hashed with bcrypt at cost factor 12, and authenticator secrets are encrypted with AES-256-GCM under a key held outside the database. Procurement records are protected by role-based access control, comprehensive access logging, and integrity monitoring that detects any change made outside the application.

### B4. TLS 1.3 in transit ⚠️ *not configured in the system as submitted*

> *Drafted:* "…and TLS 1.3 for data transmission."

**Reality:** the application listens on plain HTTP. Session cookies are marked `secure` when `NODE_ENV=production`, which anticipates HTTPS termination at a reverse proxy — but no such proxy is configured, and no certificate exists. As submitted, the claim is not supportable.

This is genuinely easy to fix and should be fixed. See **C2**.

**Recommended replacement (if not yet deployed behind TLS):**

> The application is designed for deployment behind a TLS-terminating reverse proxy; session cookies carry the `secure` attribute in production configuration so they are never transmitted over an unencrypted channel.

### B5. Digital signatures and non-repudiation ⚠️ *partially implemented — the mechanism claimed is absent*

> *Drafted:* "The system provides irrefutable evidence of user actions through cryptographic proofs and blockchain recording. Digital signatures are required for all official actions including bid submissions and contract awards."

**Reality:** there are no digital signatures, no PKI, no signing keys, and no certificate authority. What exists is strong *attribution*: every action records the actor's identity, role, IP address and timestamp in a hash-chained log, and MFA raises the confidence that the account was operated by its holder.

The distinction matters legally. The audit log proves that *this account performed this action and the record has not been altered since*. A digital signature would additionally prove that *this person, holding a private key nobody else has, assented to this specific document* — which is what "non-repudiation" means in the strict sense, and what the E-Commerce Act (RA 8792) recognises. The system provides the first, not the second.

**Recommended replacement:**

> Every official action is attributed to an authenticated individual and recorded in a tamper-evident log with the actor's identity, role, network address, and timestamp. Multi-factor authentication provides assurance that the acting account was operated by its legitimate holder. The hash chain prevents any subsequent alteration of that record, so an action cannot be repudiated by claiming the log was changed after the fact.

### B6. Hardware security modules and key management ❌ *HSM not implemented*

> *Drafted:* "Encryption keys are managed through secure key management protocols with restricted access. Private keys for blockchain transactions are stored in hardware security modules (HSMs) for BAC administrator functions."

**Reality:** there is no HSM and there are no blockchain private keys. Key management exists in a modest form: the AES key for authenticator secrets is derived by scrypt from a secret held in environment configuration and never written to the database.

**Recommended replacement:**

> Cryptographic keys are held in server environment configuration outside the application database and outside version control, and are derived using scrypt key derivation before use. Key material is never written to the database, so a compromise of the database alone does not expose authenticator secrets.

### B7. Regulatory compliance ⚠️ *needs correcting on two points*

> *Drafted:* "The system ensures compliance with Republic Act No. 10173 (Data Privacy Act of 2012) and all relevant procurement regulations under RA 9184 and RA 12009. Audit logs meet the evidentiary standards required by the Commission on Audit (COA)."

Two problems.

**First — RA 9184 is repealed.** The New Government Procurement Act (**RA 12009**) repealed RA 9184 on **13 August 2024**. Citing it as current law in a 2026 capstone is a factual error a panel may well catch, and it is the kind of error that costs disproportionate credibility. The system is built to RA 12009 and its 2026 IRR — cite only that.

**Second — "ensures compliance" and "meets evidentiary standards" are conclusions nobody has certified.** No compliance audit has been performed, no Data Privacy Act registration filed, no COA assessment obtained. Claiming a legal conclusion the project cannot support invites exactly the question it cannot answer.

**Recommended replacement:**

> The system is designed in accordance with Republic Act No. 12009 (New Government Procurement Act) and its 2026 Implementing Rules and Regulations, and with the budgeting provisions of Republic Act No. 7160 (Local Government Code). Its audit log is designed to support the documentary requirements of Commission on Audit review by retaining a complete, tamper-evident, exportable record of every procurement action and its authorising officer. Personal data handling follows the principles of Republic Act No. 10173 (Data Privacy Act of 2012) — collection is limited to what each role requires, access is restricted by role, and every access is logged. Formal compliance certification would require assessment by the respective agencies and is outside the scope of this project.

That last sentence is a strength, not a weakness. It shows the boundary is understood.

### B8. "Availability" in the umbrella claim ⚠️ *overstated*

> *Drafted:* "This ensures the confidentiality, integrity, and availability of procurement data throughout the bidding lifecycle."

**Reality:** confidentiality and integrity are addressed. **Availability** is not — there is no redundancy, no failover, no load balancing, no automated backup, and sessions are held in the application's own memory, so a restart signs everyone out. Drop the word, or add the backup arrangement described in **C3** and claim it honestly.

---

# PART C — Recommendations

Ranked by how much each actually raises the security of *this* system, not by how impressive it sounds.

### C1. Encrypt bid documents at rest — **highest priority, and achievable**

The single most serious gap. Sealed financial proposals sit in the database in plaintext, and the confidentiality of a competitive bidding round depends on them staying sealed until the BAC opens them.

**Recommended approach.** Encrypt the document BLOB with AES-256-GCM under a per-document key, and wrap that key with a master key held in environment configuration — the same pattern already proven in `models/mfaModel.js` for authenticator secrets, so the codebase already contains a working reference implementation. Decrypt on read, inside the existing permission check.

This is a contained change: the storage layer is already isolated in `services/documentStore.js`, and roughly a day's work. It converts B2 and B3 from overstatements into accurate claims. **Do this one.**

*Do not attempt true client-side encryption.* It requires browser key generation and key custody for every bidder, and it breaks server-side PDF preview, checksum-based duplicate detection, and BAC access to opened bids. The threat it defends against — an attacker between browser and server — is already covered by TLS. Server-side encryption at rest is the right control here.

### C2. Put it behind TLS — **highest priority, and nearly free**

Terminate HTTPS at nginx or Caddy in front of the application. Caddy obtains and renews a certificate automatically; the configuration is a handful of lines. The application already sets `secure` cookies in production and needs no code change at all.

Without this, session cookies and passwords cross the network in clear text and B4 cannot honestly be claimed. With it, B4 becomes true — and the claim upgrades from nothing to "TLS 1.3", since both proxies default to it.

### C3. Automated encrypted backups — **high priority**

There is currently no backup. A dropped table, a failed disk, or a ransomware event ends the system and the procurement record with it. This is a more likely and more damaging failure than any of the exotic threats the draft's security section addresses.

A nightly `mysqldump`, encrypted, retained for 30 days, with **one documented restore test**, is a few hours of work. The restore test is the part people skip and the part that matters — an untested backup is an assumption. Doing this lets you honestly add "availability" back to the umbrella claim in B8.

### C4. Malware scanning on upload — **medium priority**

The upload allow-list stops the obvious dangerous types, but a malicious macro inside an accepted `.docx` passes. ClamAV can be invoked from the upload path; a rejection on a positive result is a small change to `services/documentStore.js`. This converts A7's "validates structure and type" into the full claim the draft makes.

### C5. Security headers — **medium priority, one line of code**

Add `helmet` to the Express stack: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`. Genuine defence-in-depth against XSS and clickjacking, and a standard expectation for any web application handling government data. It is a single `app.use(helmet())`.

### C6. Move sessions out of process memory — **medium priority**

Sessions currently live in the application's memory, which means a restart signs every user out and the system cannot be run as more than one process. Moving them to a database-backed or Redis store (`connect-session-sequelize` reuses the existing MySQL connection) fixes both, and is a prerequisite for any real availability claim.

### C7. Extend anomaly detection with amount-change tracking — **worthwhile, low cost**

The alert type `amountChangedAfterApproval` is already defined but has no rule behind it. A rule comparing each amount against the value at the moment of its authorising approval would catch a contract value edited after the BAC approved it — a classic procurement fraud, and one the current fingerprints would only catch if the edit happened outside the application. Perhaps half a day.

### C8. Do not add blockchain, BFT consensus, or HSMs

Stated plainly so the decision is on record rather than looking like an omission.

- **Blockchain / BFT consensus** — solves distrust between independent organisations. A municipal LGU has one accountable authority and a statutory auditor. The hash chain provides the tamper-evidence; consensus would add key custody at DBM and COA, node operations, and an inter-agency governance agreement, for no threat this system faces. See B1 for how to say this if asked.
- **HSM** — meaningful only when there are high-value long-lived private keys to protect. There are none, and the hardware cost is not justifiable for a municipal deployment. Environment-held keys with scrypt derivation are the proportionate control.
- **Digital signatures / PKI** — genuinely valuable for legal non-repudiation, but it requires a certificate authority, key issuance to every bidder, and revocation handling. It is a project in its own right, not an addition to this one. If the panel raises it, the honest answer is that the system provides authenticated attribution rather than cryptographic signature, and that adding PKI would be the natural next phase.

---

## Summary table

| # | Security claim | Status | Action |
|---|---|---|---|
| 1 | Role-Based Access Control | ✅ Implemented | Correct the role list (A1) |
| 2 | Multi-Factor Authentication | ✅ Implemented | Strengthen the claim — it covers all users (A2) |
| 3 | Audit Log Integrity | ✅ Implemented | Remove "on-chain" (B1) |
| 4 | Data Anomaly Detection | ✅ Implemented | Remove "blockchain hash mismatches" (A4) |
| 5 | Logging and Tracking | ✅ Implemented | Remove "on the blockchain" (B1) |
| 6 | Session Timeout | ✅ Implemented | Accurate as drafted (A6) |
| 7 | Input Validation | ✅ Implemented | Remove "scans for malicious content" (A7, C4) |
| 8 | Rate Limiting | ✅ Implemented | Remove "monitors network traffic" (A8) |
| 9 | Password storage | ✅ Implemented | Add to the documentation — currently omitted (A9) |
| 10 | Encryption at rest | ⚠️ MFA secrets only | Rewrite (B3); fix by C1 |
| 11 | TLS in transit | ⚠️ Not configured | Rewrite (B4); fix by C2 |
| 12 | Non-repudiation | ⚠️ Attribution, not signatures | Rewrite (B5) |
| 13 | Key management | ⚠️ Environment-held, no HSM | Rewrite (B6) |
| 14 | Regulatory compliance | ⚠️ RA 9184 repealed; claim overstated | Rewrite (B7) |
| 15 | Client-side encryption | ❌ Absent | Remove (B2); fix by C1 |
| 16 | Blockchain / BFT consensus | ❌ Absent | Remove entirely (B1) |
| 17 | HSM | ❌ Absent | Remove (B6) |

**Nine of the fifteen drafted claims are true and demonstrable.** Four are partially true and need rewording. Two — blockchain and client-side encryption — should be removed, one of them because it describes a design this system deliberately does not need, the other because it describes a control that should genuinely be built (C1).

Doing C1, C2 and C3 — encryption at rest, TLS, and tested backups — would take a few days and would make the corrected section stronger than the original overstated one, because every sentence in it could be demonstrated on request.
