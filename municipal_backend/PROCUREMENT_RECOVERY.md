# Scoped procurement recovery

The existing procurement models support a controlled recovery that reads a DOCX
in its original field order and stops immediately after **Item Description:
Emergency response equipment and supplies**. The Windows XML reader never
extracts Technical Specifications or any later source field.

## Run the importer

From the repository root, preview the operation first:

```powershell
npm.cmd run restore:procurement --prefix municipal_backend -- --source "C:\Users\ASUS\Downloads\Procurement_Information_Form_New_Project_2026.docx" --database municipal_backend --report-directory "C:\Users\ASUS\ProcureNance-recovery-backups\2026-10-09\reports"
```

The completed local recovery used this command. Repeating it preserves existing
records and timestamps and does not add duplicate audit or progression events:

```powershell
npm.cmd run restore:procurement --prefix municipal_backend -- --source "C:\Users\ASUS\Downloads\Procurement_Information_Form_New_Project_2026.docx" --database municipal_backend --report-directory "C:\Users\ASUS\ProcureNance-recovery-backups\2026-10-09\reports" --apply --reconstruct-progression --backup-directory "C:\Users\ASUS\ProcureNance-recovery-backups\2026-10-09" --mysqldump "C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqldump.exe"
```

The database must match the configured local application database. Every apply
creates a full private backup before targeted schema changes or business writes.
Source extracts, row-signature baselines and recovery reports stay outside Git.
An existing matching project with different or unverified provenance causes a
refusal; the importer does not overwrite it or create another copy.

## Workflow and evidence

The project is an `AppEntry`, linked to the implementing `Department`. Its draft
`PrHeader` and description-only `PrLineItem` retain the normal relationships.
The planned quantity and unit belong to the procurement plan; requisition item
quantities, costs, specifications and classification remain NULL at this scope.
The PR reference is allocated by the existing sequence service during recovery;
it is not represented as the lost original number.

The form names an AIP project and an appropriation but does not establish an
adopted planning chain, enacted ledger line, budget split or verified requester
account. Those references remain verbatim in the source fields. No guessed
development plan, adopted AIP, appropriation or approval is created. These held
drafts cannot be edited, submitted, certified or approved by the normal API
until their missing evidence is handled in a separately authorized operation.
Ordinary procurement creation and submission validations remain in place.

All 28 source responses are available under **Annual Procurement Plan → View
details**. The requisition appears in **Purchase Requisitions → View**, using
the normal Draft layout, explicit No/N/A responses and blank unknown costs.
**Source and record history** keeps recovery provenance separate from the normal
record display. Public publication follows the existing approval boundary.

`createdAt`, `updatedAt`, and `AuditLog.recordedAt` use the actual recovery time.
Unverified original creation/modification timestamps remain NULL. Optional
September 25–October 9 progression entries are explicitly reconstructed,
contain a separate date-only `activityDate`, name no original actor, and are
appended with the current audit timestamp. There is no backdating or rewriting
of authentic audit entries. System audit activity uses `actorId: null` and is
visible to authorized technical-log readers under the existing system scope.
The supplied photograph is not used or stored by this recovery.

## Verification

The apply command compares every original row's field signature, checks the
native field mapping and all original source wording, checks relationships and
the exact checkpoint, verifies no unrelated table row counts change, and runs
the import a second time. Audit findings are compared to the pre-import baseline
so existing problems are preserved and new problems are reported separately.

The full backup can be restored into a newly created disposable schema, then
compared against the original baseline without touching the application schema:

```powershell
npm.cmd run verify:procurement-recovery-backup --prefix municipal_backend -- --baseline "C:\Users\ASUS\ProcureNance-recovery-backups\2026-10-09\reports\baseline-2026-10-09T03-49-17-642Z.json" --output "C:\Users\ASUS\ProcureNance-recovery-backups\2026-10-09\reports\backup-restore-verification.json"
```

Run the database tests from `municipal_backend`; they create and remove only
uniquely named disposable schemas, using synthetic values:

```powershell
$env:RUN_PROCUREMENT_DB_TESTS = '1'
$env:PROCUREMENT_TEST_DB_PORT = '3306'
node --test tests/procurementRecovery.integration.test.mjs tests/procurementInformation.integration.test.mjs tests/procurementInformation.test.mjs
```

Browser verification uses the real built React routes. The optional
`RECOVERY_BROWSER_SNAPSHOT` points to read-only output from the application list
controllers. Authentication and shell endpoints in that test are fixtures; it
does not claim to verify real account login or a deployed client environment.

```powershell
node --test tests/procurementRecovery-ui.browser.mjs tests/procurementInformation-ui.browser.mjs
```

The detailed local result and field-by-field mapping are in the private recovery
report directory named above. No recovery operation proceeds past Item Description.
