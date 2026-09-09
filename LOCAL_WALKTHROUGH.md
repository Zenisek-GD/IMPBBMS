# Local walkthrough from an empty workflow

The local walkthrough database is `municipal_walkthrough_20260907`.
The previous database, `municipal_backend`, is retained. The backend selects
its database using `DB_NAME` in `municipal_backend/.env`; restart the backend
after changing that value. Sign out and sign in again after switching.

Only `npm run migrate` and `npm run seed` populate the new database.
The regular seed creates roles, permissions, offices, accounts, procurement
modes, observer organisations, templates and settings. Do not run
`npm run seed:demo` for this walkthrough: it adds completed example workflows.

## Local test accounts

All accounts created by the regular development seed use `Passw0rd!`.

| Role | Email |
| --- | --- |
| Planning | planningofficer@procurenance.com |
| Sanggunian Secretary | sangguniansecretary@procurenance.com |
| Mayor / HoPE | hope@procurenance.com |
| System Administrator | systemadministrator@procurenance.com |

Fresh accounts have no authenticator enrollment. Complete the enrollment
screen when prompted; the role-based security settings remain in effect.

## Start with the 2027 computer project

1. Planning: open **Development Plan & AIP → Development Plan → NEW PLAN**.
   Use **Municipal Digital Services Development Plan 2027–2029**, start year
   **2027**, end year **2029**, and enter the vision.
2. Planning: **ADD GOAL** → **Modernize municipal office workstations**.
   Choose the Institutional sector and ICT subsector.
3. Sanggunian Secretary: **RECORD ADOPTION** on the development plan with
   resolution **DEMO-SB-2026-001**.
4. Mayor / HoPE: **SET PRIORITIES**, fiscal year **2027**, select that goal.
5. Planning: **Investment Program → NEW AIP**, select **2027**, then **CREATE AIP**.
6. Planning: **ADD PROJECT** in AIP 2027. Enter **Supply and Delivery of 20
   Desktop Computers**, choose the workstation goal, estimated cost **1200000**,
   fund **General Fund**, expense class **Capital Outlay**, and Q1–Q1.
7. Planning: **SUBMIT FOR ENDORSEMENT**. Mayor / HoPE: **ENDORSE**.
   Sanggunian Secretary: **RECORD ADOPTION**, resolution **DEMO-SB-2026-002**.
8. Continue with the indicative PPMP and annual budget, enacted appropriation,
   final procurement plan, purchase request, bidding and Notice of Award.

For a walkthrough with the standard seeded requester and head-of-office
accounts, select the **Municipal Engineering Office** as the implementing
office: both accounts are assigned there. To use GSO instead, configure a
GSO requester and a separate GSO head through System Administration first.

A development goal is linked to an AIP project through **ADD PROJECT**; recording
or adopting the goal does not automatically create a costed project.
