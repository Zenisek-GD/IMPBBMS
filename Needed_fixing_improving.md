# Needed fixing / improving — verified

Your original notes, item by item, each checked against the code. Your wording is
preserved in quotes. Under each is a verdict:

- **Confirmed** — I reproduced it in the code; your description is accurate.
- **Confirmed, with correction** — real, but your description is off in a detail
  that changes the fix.
- **Wrong** — the thing you described is not what the code does. Where you were
  wrong for a *good reason* (you looked and genuinely could not find it), the
  reason is itself a defect and is written up.
- **New feature** — not a bug; nothing like it exists yet.

Sources used: GPM Volume 1 (the PDF you gave me — 120 pages, not 13), the two
procurement-titles URLs, and the code on branch `hardening-and-conformance`.

---

## 0. First, the two URLs you gave me

`procurementtactics.com/procurement-titles` and
`scmdojo.com/procurement-department-roles-and-responsibilities` are both about
**private-sector corporate procurement departments** — Chief Procurement Officer,
Director of Procurement, Category Manager, Strategic Sourcing Manager, Buyer,
Contract Manager, with US salary bands attached.

**Do not model any role in this system on them.** A Philippine municipality's
procurement organisation is not a corporate procurement department; it is fixed
by statute. Who exists, what they may do, and who may not do what someone else
does is set by RA 12009 and its IRR, and by the Local Government Code Book II —
not by org-chart convention. There is no "Category Manager" in an LGU, and there
is no lawful way to invent one. A "Buyer" who "processes purchase orders" would,
in this system, be collapsing `pr.certify`, `pr.obligate` and `pr.certifyCash`
into one pair of hands — the exact control failure LGC Sec. 344 exists to prevent.

The only thing worth taking from those pages is vocabulary for the *public-facing*
labels, and even that is risky. The system's role names already match the statute.
Leave them.

The GPM PDF is the relevant document, and note it is the **superseded** manual —
it cites RA 9184 and the 2016 IRR throughout. RA 12009 repealed those. I used it
for the parts that carried forward unchanged (BAC composition, roles and
responsibilities, observers), which is where your questions land.

---

## 1. Planning Officer — plan date range + meeting announcement

> "In the planning officer when creating a new plan, also put time and date range.
> Also this can be a way to send a message to all officials needed for planning…
> After sending it can send to the officials email and system. But only on those
> officials related."

**New feature.** Nothing like it exists.

What is already there to build on:
- `services/notifier.js` — `notifyUsers`, `notifyByRole`, `notifyByPermission`.
  The last one is exactly "only those officials related": fan out to whoever holds
  `budget.conductForum`, say, rather than to a hand-picked list.
- `models/notificationModel.js` + the bell in the header — the in-system half.
- `services/mailer.js` — SMTP works, but every template is hardcoded for a
  specific event (activation, OTP, password change). There is **no generic
  "notice" template**, so the email half needs one.

What does not exist: any meeting/convening entity at all. A plan has no date
range field. This is a new model + endpoint + screen, not a tweak.

---

## 2. Development Plan & AIP page is overwhelming

> "in the planning official development plan and aid section/page, can you
> redesign it since it is overwhelming, when i open it, i dont know what to see
> first."

**Confirmed.** `pages/planning/DevelopmentPlanning.jsx` is 31.9 KB with six
tables on one screen and no visual hierarchy. ("aid" = AIP, Annual Investment
Program.)

---

## 3. APP Alignment page + Budget Preparation / Appropriation Register tables

> "In the planning offical, the app alignment section/page, add a search bar,
> sort, filter… Add search, filter, sort, pagination in the budget preperation
> and appropriate register table."

**Confirmed, with correction.** Precisely what exists today:

| Page | Search | Filter | Sort | Pagination |
|---|---|---|---|---|
| APP Entries (`/app-entries`) | ✗ | status dropdown only | ✗ | ✓ |
| Budget Preparation | ✗ | ✗ | ✗ | ✗ |
| Appropriation Register | ✗ | ✗ | ✗ | ✓ |

So: pagination is already on two of the three; **sort exists nowhere in the
entire application** (I grepped — zero sort implementations across all pages);
free-text search exists on one public page only.

`components/ui/Toolbar.jsx` already exports `SearchInput`, `FilterSelect`,
`ResetFilters`. They are almost unused. The missing piece is a **sortable table
header** primitive, which does not exist and should be built once.

> "Also remove the development plan and budget in the header, since there is
> already in the sidebar."

**Confirmed.** `config/navigation.js` — `planningOfficer.topLinks`. See item 21,
which generalises this.

---

## 4. Theme toggle icon smaller than bell and profile

> "the logo of darkmode and light mode is much smaller that the logo of the
> notification and profile in the header"

**Confirmed exactly.** Measured:

| Control | Icon size |
|---|---|
| Theme toggle (`ThemeToggle.jsx:32`) | **15 px** |
| Notification bell (`NotificationBell.jsx:91`) | **20 px** |
| Profile (`ProfileMenu.jsx:52`) | **22 px** |

Three different sizes in one 4-item strip. All three should be one size.

---

## 5. Header too small

> "the header is so small, make it bigger but not too big, this applies to the
> overall system."

**Confirmed.** `TopNavBar.jsx:19` — `h-12` (48 px), with 12 px and 9.5 px text
inside it. 56–60 px is the right target.

---

## 6. Move profile and logout into the sidebar; profile page is ugly

> "there is a profile in the header upper right. Put that in the sidebar, same as
> the others. Put the log out in the sidebar aswell… after click the my profile
> in the sidebar, that is where officials can edit, view, change password their
> profile. Currently the layout is ugly."

**Confirmed.** Today profile/password/logout live in a dropdown
(`ProfileMenu.jsx`) and open modals (`ProfileModals.jsx`, 15.4 KB). There is no
`/profile` route at all.

Note what this implies: making profile a real **page** rather than a modal means
adding a route, and the sidebar footer becomes a new region in `Sidebar.jsx`
(which currently has no footer). Worth doing — a 15 KB modal is a page in denial.

---

## 7. Logout confirmation

> "Put confirmation in log out. Currently when i log out, it straight log me out."

**Confirmed.** `ProfileMenu.jsx:102` calls `onLogout` directly.

---

## 8. "Workplace" instead of dashboard; every role shares one workspace

> "instead of dashboard it says workplace. I also noticed that every role share
> the same layout of the workplace, especially the recent system activity. Recent
> system acitivity should only be availably to the admin and hope. I want you to
> make a dashboard specifically for each role."

**Confirmed, with three corrections.**

1. It says **"Workspace"**, not "workplace". That naming was deliberate. Whether
   to rename it "Dashboard" is your call — but it is not a typo.

2. **Confirmed and it is the single biggest defect in your list.**
   `pages/dashboards/RoleWorkspace.jsx` is rendered for **thirteen** roles:
   `/admin`, `/executive`, `/bac-chair`, `/bac-member`, `/secretariat`, `/twg`,
   `/dashboard`, `/budget`, `/planning-office`, `/sanggunian`, `/finance`,
   `/supplier`, `/transparency`, `/audit`. One file. The four cards it shows are
   the same four for everyone, and "Your queue" pulls a generic
   `/finance/pending-items` list rather than the stages actually waiting on that
   officer. **This is the root cause of item 23** — see below.

3. **"Recent system activity should only be available to admin and HoPE" — I
   would push back.** It is currently gated on `audit.viewAll || audit.viewLogs`,
   which ten roles hold. That is too many, agreed. But restricting it to Admin and
   HoPE would blind the **Internal Auditor**, whose entire statutory purpose is
   reading the audit trail. My recommendation: Admin, HoPE, **and Internal
   Auditor**. Say the word if you still want it at two.

---

## 9. Sanggunian Secretary role

> "in the secretary role, remove the budget and plans in the header. Put search,
> filter, sort, pagination in the budget prepreration table. Development Planning
> section is so overwhelming. I also noticed that development planning section
> shares the same in roles, is that okay?"

Header links — **confirmed** (item 21 covers it). Budget prep table —
**confirmed** (item 3). Overwhelming — **confirmed** (item 2).

> "development planning section shares the same in roles, is that okay?"

**Yes, that is correct and it should stay that way.** There is one Comprehensive
Development Plan and one Annual Investment Program for the whole municipality.
The Planning Office writes it, the Mayor sets priorities against it, the
Sanggunian adopts it, and every office reads it to justify its budget request.
Those are different *acts on one record*, not different records. Splitting the
page per role would mean four screens showing the same rows.

The page already does this correctly: `App.jsx:87-105` lets nine roles in, and
`DevelopmentPlanning.jsx` decides which controls to render from the caller's
permissions, not from the URL. That is the right pattern. **Keep it.**

---

## 10 & 22. Roles sharing sidebar contents / shared layout pages

> "why does some officils shares the same sidebar contents, if its needed keep it.
> But if its outside of an official access remove it."
> "all officials shares the same layout pages, correct me if im wrong, if its
> needed to be shared then so be it, but if its outside of an official access, fix
> it."

**Mostly already correct — with two real dead links found.**

Shared *pages* are correct by design and match item 9's reasoning: `/planning`,
`/budget/preparation`, `/app-entries`, `/purchase-requisitions`, `/contracts`,
`/observers`, `/protests` are each one record acted on by several offices, and
each page picks its controls from permissions.

Two actual mismatches found:

- **`/pending-items`** — `RoleWorkspace.jsx` fetches it for the Municipal
  Accountant and Treasurer (both hold `pr.view`/`budget.view`, and the API allows
  them), but `App.jsx:300` does **not** list either role on the route. They get
  the data on their dashboard and a 403 if they try to open the page.
- **`/observers`** — the BAC Chairperson and Vice-Chairperson have the sidebar
  link and the route, but not `observer.manage`, so the page renders read-only for
  them. See item 26 — this is a permission bug, not a nav bug.

---

## 11. Admin console

> "In the admin remove the overview and audit in the header." — **Confirmed** (item 21).

> "User and roles, improve the modal for adding new. Make it sharp, and currently,
> its like putting everything in a small container." — **Confirmed.**
> `AdminUsers.jsx` (19.2 KB) uses `Modal size="md"` (`max-w-md`) for a
> multi-section form. Wrong size for the content.

> "Bidders accounts add search, sort, filter, pagination." — **Confirmed, with
> correction.** `VendorVerification.jsx` already has pagination. Search, sort and
> filter are missing.

> "We have a feature where after creating an account for the bidders, a message
> will be sent to the officials email and system. Can you add a new feature where
> admin can customize the letter."

**New feature, and a good one.** `services/mailer.js:137`
`sendActivationInvitation` is a hardcoded HTML template. Making it editable means
a settings-backed template with a fixed set of substitution tokens
(`{{businessName}}`, `{{activationUrl}}`, `{{expiresAt}}`).

⚠️ One hard constraint: **the activation URL and expiry must not be removable by
the editor.** If an admin deletes `{{activationUrl}}` from the template, every
bidder invitation silently becomes undeliverable. Validate on save.

> "New department adding modal improve it." — **Confirmed.** `AdminDepartments.jsx`.

> "Improve UI of the system settings. Why does the threholds and system settings
> share the same page. Fix it. It should not be like that."

**Confirmed, and it is worse than you think.** `App.jsx:206-207`:

```
<Route path="/admin/settings" element={<AdminSettings />} />
<Route path="/admin/thresholds" element={<AdminSettings />} />
```

Two sidebar entries pointing at the *same component*. The Thresholds link is
decorative — it does not go anywhere different. Procurement thresholds
(`services/procurementThresholds.js`) are a statutory matter under RA 12009 and
deserve their own screen showing the ceiling per mode.

---

## 12. Announcement modal

> "In adding a new annoucement change the modal design. Improve it. And about the
> setting the time and date, can you change it, currently its not uder friendly,
> and make the modal of adding not too long."

**Confirmed.** `AnnouncementsAdmin.jsx`, 20.5 KB. The form is one long column.
Fix is a stepped or sectioned modal at `size="lg"`/`"xl"` plus a proper
date-time control.

---

## 13. Audit trail — action names and entity column

> "the action column say it like this 'auth.login.success', change that into a
> proper action name, also remove the entity column."

**Confirmed, with a correction on the second half.**

`AuditLog.jsx:154` renders `entry.actionType` raw. There is already a
human-readable `entry.summary` on every row — it is just not shown in the table
(only in the detail modal). So the fix is partly free.

**On removing the Entity column: I'd argue against deleting it outright.** An
audit log whose rows do not say *which record* was acted on is much less useful
to an auditor or to COA. But you are right that `Contract#41` is ugly and eats
width. Better: fold the entity into the Action cell as a subtitle, and keep it in
the detail modal (where, oddly, it is currently **not** shown at all). You lose
the column, you keep the evidence. Tell me if you want it gone entirely anyway.

---

## 14. Development planning page named differently in each sidebar

> "the develeopment planning page is same with all officials. But why does in the
> sidebar it is called different?"

**Confirmed.** One route, `/planning`, with five different labels:

| Role | Sidebar label |
|---|---|
| Mayor (HoPE) | "Priorities & Investment Program" |
| Planning Officer | "Development Plan & AIP" |
| Sanggunian Secretary | "Plan & AIP Adoption" |
| Head of Office / Requester / Budget Officer | "Investment Program" |
| Internal Auditor | "Development Plan & AIP" |

The intent was to name the link after what *that office does* there. In practice
it makes the system look like it has five different pages. Recommend one label —
"Development Plan & AIP" — everywhere.

---

## 15. APP / PR / Award approval tables need search, sort, filter

**Confirmed.** Same finding as item 3: status dropdown and pagination exist on
APP and PR; search and sort exist nowhere. `/evaluation` (award approvals) has
neither pagination nor filtering.

---

## 16. Public contact / feedback form

> "Add a new feature where in the public landing page people can contact or send
> a message, feedback. And when they send it. It will go to the role that is
> responsible for that."

**New feature — and it reverses a deliberate decision, so flagging it.**

`routes/publicRoutes.js:38-41` says in a comment:

> "This surface is now READ ONLY, with no exceptions. It briefly carried a
> bidder-requirements intake endpoint… the endpoint was removed rather than left
> in place unused."

So adding a public write endpoint is a real architectural change. It is
defensible — a transparency portal with no way to report a problem is half a
portal — but it needs, non-negotiably:

1. Rate limiting (the `rateLimit` middleware exists and is already used there).
2. Spam/abuse handling. An unauthenticated write endpoint on a government site
   will be found by bots within days.
3. A routing table: category → role. This is the part that needs your input —
   see the questions at the end.
4. The submissions must **not** enter the audit chain as official acts. They are
   inbound public mail, not municipal decisions.

---

## 17. Mayor — remove Insights and Approvals from header
**Confirmed** (item 21).

## 18. Head of Office — remove Dashboard, Requisitions, Deliveries from header
**Confirmed** (item 21). Budget preparation table — **confirmed** (item 3).

---

## 19, 20, 21. The three system-wide sweeps

> "Put search, sort, filter in the every table in the system."
> "Change, improve the UI for every modal in the system, make it clean, minimal,
> professional and sharp."
> "Remove every clickable words in the header of every officials system since
> there is already in the sidebar."

**All three confirmed.** Item 21 is the cheapest and highest-value: `topLinks` is
declared for all seventeen roles in `config/navigation.js` and rendered at
`TopNavBar.jsx:27-43`. Deleting the block and all seventeen `topLinks` arrays
resolves items 3, 9, 11, 17 and 18 in one change, and frees the header height
that item 5 needs.

Items 19 and 20 are large. There are **24 files containing tables or modals**.
These want a shared primitive built once (a sortable/filterable table wrapper,
and modal size/section conventions) and then applied — not 24 bespoke rewrites.

---

## 23. "The Accountant can't do anything" — and Treasurer, BAC, TWG

> "in the accountant, accountant cant do anything, like it feels that the
> accountant is just there to view and nothing else… Same issue with treasurer.
> SAme with BAc. SAme with BAc vice chairperson. SAme issue with bac member. Same
> with technical WG."

**Wrong as stated — but you found a real defect, and it is item 8.**

Every one of those roles has real, statutory authority in the code:

| Role | What they can actually do | Authority |
|---|---|---|
| Municipal Accountant | `pr.obligate` — obligate the appropriation and raise the ORS; `payment.certify` | LGC Sec. 344 |
| Municipal Treasurer | `pr.certifyCash` — certify funds are in the treasury; `payment.release` | LGC Sec. 344 |
| BAC Chairperson | `pr.determineMode`, `bidding.chairEvaluation`, `protest.resolve` | IRR Sec. 12 |
| BAC Vice-Chairperson | identical set — the quorum rule requires it | GPM p.37 |
| BAC Member | `bidding.evaluate`, `protest.resolve` | IRR Sec. 12 |
| TWG Member | `bidding.technicalInput` | IRR Sec. 14 |

These are not view permissions. An Accountant who does not obligate stops every
requisition in the municipality.

**So why did it feel like they can do nothing?** Because all six of them land on
`RoleWorkspace.jsx`, which shows the same four cards to everybody and a "Your
queue" panel fed by a generic pending-items list — *not* by the stages actually
waiting on that officer. An Accountant signs in, sees no requisitions awaiting
obligation, and concludes the role is decorative. The permission model is right;
the landing screen is lying about it.

**Fix item 8 and item 23 dissolves.** Each role's workspace should show its own
queue: "3 requisitions awaiting your obligation", not "Nothing is waiting on you."

---

## 24. Does the BAC Secretariat verify bidders?

> "I noticed that the bac secretariat is the one responsible for veryfying a
> bidders. Correct me if im wrong, but is that correct? Because i thought its the
> secretary of the mayor."

**You are half right, and the half you are right about is a real bug.**

**Wrong half:** it is emphatically **not** the Mayor's secretary. In this system
that role is `sanggunianSecretary` — the Office of the Sangguniang Bayan, clerk
of record to the legislature. Under the IRR that office has **no procurement
function whatsoever**, and the system correctly gives it none. It records the
Appropriation Ordinance and the provincial review; that is all. Do not move
bidder verification there.

**Right half — the code is wrong.** GPM Volume 1, p.35 ("Responsibilities of the
BAC"), item iv:

> Determine the eligibility of prospective bidders.

That is the **BAC's** responsibility. The BAC Secretariat's registry duty is
listed separately at p.35 item iii — "create, maintain and update the registry of
suppliers, contractors, and consultants." Maintaining a registry is record-keeping.
Determining eligibility is adjudication. Different offices.

What the code does (`routes/vendorRoutes.js:45`):

```
router.post("/:id/review", requirePermission("bidding.publish"), reviewVendor);
```

`bidding.publish` is held by `bacSecretariat` **only**. So the support office is
making the committee's eligibility determination on its own signature, with no
BAC involvement at all.

This is the same class of defect as `pr.determineMode`, which was already caught
and moved from the Secretariat to the Chair/Vice-Chair for exactly this reason —
the fix just never got applied to vendor eligibility.

**Recommended fix:** split it. The Secretariat records the submission and checks
document completeness (keeps `bidding.publish`); a new `vendor.determineEligibility`
goes to the BAC Chairperson and Vice-Chairperson. Admin/IT still issues the
account afterwards (`bidders.createAccount`), which is already correctly separated.

> "fix the modal of record counter subkission, its so long. can see all contents."

**Confirmed.** `CounterSubmissionModal.jsx` is 18.7 KB in a single modal.

---

## 25. View button on a PR

> "when viewing a pr much better if there is a view button feature which can be
> use to see further information."

**Confirmed** — there is no detail view. `PurchaseRequisitions.jsx` renders rows
with action buttons but no way to open one and read its lines, stage trail,
certifications and remarks.

---

## 26. Observers can be invited, but nobody can invite them

> "in observers, they can be invited, but i dont see any feature in the system
> where an officials responsible for inviting exist."

**Wrong as stated — but you found the bug, and you probably found it as the BAC
Chairperson.**

The feature exists: `pages/bidding/Observers.jsx:25` defines `InviteModal`, and
`/observers` has a sidebar entry for four roles. It works.

**But `observer.manage` is held by `bacSecretariat` alone.** The page reads
`const canManage = has('observer.manage')` at line 230 and hides the invite
control when false. So the BAC Chairperson and Vice-Chairperson — who have the
link, the route, and the page — see the observer roster with **no invite button**.
If that is what you saw, you saw correctly.

And the statute agrees with you. GPM Volume 1, p.36, "Responsibilities of the
BAC", item xvi:

> Invite the Observers required by law to be present during selected stages of
> the procurement process.

Inviting observers is the **BAC's** duty. The Secretariat's role is to "organize
and make all necessary arrangements for the BAC and the TWG meetings and
conferences" (p.34) — it makes the arrangements, the committee issues the
invitation.

**Recommended fix:** grant `observer.manage` to `bacChairperson` and
`bacViceChairperson` as well. Keep it with the Secretariat too — they do the
administrative work. `observer.participate` stays with observers only, which is
already correct and is the important separation.

---

# Proposed order of work

Not all at once. Grouped so each phase is independently shippable and testable.

### Phase 1 — Chrome and navigation (low risk, immediately visible)
Items 4, 5, 6, 7, 14, 17, 18, 21, and the header half of 3, 9, 11.
- Delete `topLinks` everywhere; remove the header nav block.
- Header to ~56 px; all three header icons to one size.
- Profile → real `/profile` page; profile + logout move to a sidebar footer.
- Logout confirmation.
- One consistent label for `/planning`.

### Phase 2 — Table and modal primitives
Items 19, 20, and the table halves of 3, 9, 11, 15, 18.
- Build a sortable/searchable/filterable table wrapper once, on top of the
  existing `Toolbar` and `usePagination`.
- Set modal size and section conventions.
- Then apply to APP, PR, Budget Preparation, Appropriations, Evaluation, Vendors,
  and the rest.

### Phase 3 — Per-role dashboards
Items 8 and 23 — the same fix.
- Split `RoleWorkspace.jsx` into real per-role workspaces driven by each role's
  actual queue.
- Restrict "Recent system activity" to Admin, HoPE and Internal Auditor.

### Phase 4 — Permission corrections (needs care, has tests)
Items 24, 26, and the `/pending-items` route gap in item 10.
- `vendor.determineEligibility` → BAC Chair / Vice-Chair.
- `observer.manage` → add BAC Chair / Vice-Chair.
- Add Accountant and Treasurer to the `/pending-items` route.
- Re-run the three e2e conformance harnesses; reseed permissions.

### Phase 5 — Screen redesigns
Items 2, 11 (settings/thresholds split), 12, 13, 24 (counter-submission), 25.

### Phase 6 — New features
Items 1 (planning meeting notices), 11 (customisable invitation letter),
16 (public contact form).
