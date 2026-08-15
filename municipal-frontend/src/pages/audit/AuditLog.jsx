import { useEffect, useMemo, useState } from 'react'
import { ScrollText, ShieldCheck, ShieldAlert, Download } from 'lucide-react'
import * as insightsApi from '../../api/insights'
import { OUTCOME_TONES, auditExportUrl, actionLabel, entityLabel } from '../../api/insights'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'

export default function AuditLog() {
  const permissions = usePermissions()
  const [entries, setEntries] = useState([])
  const [verification, setVerification] = useState(null)
  const [inspecting, setInspecting] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([insightsApi.fetchAuditLog(), insightsApi.verifyAuditChain()])
      .then(([log, verify]) => {
        if (cancelled) return
        setEntries(log)
        setVerification(verify)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const canExport = permissions.has('audit.export')

  // Only the actions actually present, named the way the table names them, and
  // ordered the way a reader would look for them.
  const actionOptions = useMemo(() => {
    const seen = new Set(entries.map((entry) => entry.actionType).filter(Boolean))
    return [...seen]
      .map((value) => ({ value, label: actionLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [entries])

  // The actor and outcome filters were query parameters behind a 250ms debounce;
  // they are local now, so they combine with a free-text search across the
  // action, the record and the summary, and with a column sort.
  //
  // Search covers the readable action name as well as the raw key, so both
  // "signed in" and "auth.login" find the same rows.
  const table = useTableControls(entries, {
    searchKeys: (entry) =>
      [
        entry.actionType,
        actionLabel(entry.actionType),
        entityLabel(entry),
        entry.summary,
        entry.actorName,
        entry.actorRole,
      ]
        .filter(Boolean)
        .join(' '),
    filters: [
      {
        key: 'outcome',
        label: 'All outcomes',
        options: [
          { value: 'success', label: 'Success' },
          { value: 'denied', label: 'Denied' },
          { value: 'failed', label: 'Failed' },
        ],
      },
      { key: 'actorName', label: 'All actors' },
      { key: 'actorRole', label: 'All roles' },
      // Explicit options, because the derived ones would be the raw keys — and
      // a dropdown full of "auth.login.success" is the thing this screen is
      // being fixed to stop showing.
      { key: 'actionType', label: 'All actions', options: actionOptions },
    ],
    accessors: {
      sequence: (entry) => Number(entry.sequence ?? 0),
      actionType: (entry) => actionLabel(entry.actionType),
    },
  })
  const { pageRows, paginationProps } = table

  return (
    <DashboardPage>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only, hash-chained record of every critical action — including denied ones."
        actions={
          canExport && (
            <Button icon={Download} onClick={() => window.open(auditExportUrl, '_blank')}>
              EXPORT CSV
            </Button>
          )
        }
      />

      {/* The integrity verdict is the headline — a tamper-evident log is only
          worth anything if someone can see whether it is still intact. */}
      {verification && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            verification.intact ? 'border-success/30 bg-success/10' : 'border-danger/40 bg-danger/10'
          }`}
        >
          {verification.intact ? (
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
          ) : (
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-danger" />
          )}
          <div className="min-w-0">
            <p className={`text-[13px] font-semibold ${verification.intact ? 'text-success' : 'text-danger'}`}>
              {verification.intact
                ? `Chain intact — ${verification.entriesChecked} entries verified`
                : `Chain integrity FAILED — ${verification.problems.length} problem(s) found`}
            </p>
            {!verification.intact && (
              <ul className="mt-1 flex flex-col gap-0.5">
                {verification.problems.slice(0, 5).map((problem, index) => (
                  <li key={index} className="text-xs text-danger">
                    Entry #{problem.sequence} — {problem.detail}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 truncate font-mono text-[11px] text-text-faint">
              head: {verification.headHash}
            </p>
          </div>
        </div>
      )}

      <Card bodyClassName="p-4">
        <TableToolbar
          {...table.toolbarProps}
          searchPlaceholder="Search action, record, actor or summary…"
        />
      </Card>

      <Card title="Events" icon={ScrollText} bodyClassName="">
        {table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'No recorded events yet.'
              : 'No events match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('sequence')}>#</SortableTh>
                  <SortableTh {...table.sortProps('recordedAt')}>When</SortableTh>
                  <SortableTh {...table.sortProps('actionType')}>Action</SortableTh>
                  <SortableTh {...table.sortProps('actorName')}>Actor</SortableTh>
                  <SortableTh {...table.sortProps('outcome')}>Outcome</SortableTh>
                  <SortableTh {...table.sortProps('hash')}>Chain</SortableTh>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setInspecting(entry)}
                    className="cursor-pointer border-t border-border-muted align-top hover:bg-sidebar"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-text-faint">{entry.sequence}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {/* Explicit 12-hour clock. Bare toLocaleString() inherits
                          the host locale, which renders a 24-hour ("military")
                          time on many machines; the options pin it to AM/PM with
                          the date, so "when" reads the same on every officer's
                          screen. */}
                      {new Date(entry.recordedAt).toLocaleString('en-PH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </td>
                    {/* The record acted on used to have a column of its own,
                        printed as "Contract#41". It reads better as a subtitle
                        under the action, and the raw key stays available in the
                        detail dialog and the CSV export. */}
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-navy">{actionLabel(entry.actionType)}</p>
                      {entityLabel(entry) && (
                        <p className="mt-0.5 text-[11px] text-text-faint">{entityLabel(entry)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-navy">
                      {entry.actorName ?? '—'}
                      {entry.actorRole && (
                        <p className="text-[11px] text-text-faint">{entry.actorRole}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={OUTCOME_TONES[entry.outcome]}>{entry.outcome}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-text-faint">
                      {entry.hash.slice(0, 10)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="log entries" />
      </Card>

      {inspecting && (
        <Modal title={`Event #${inspecting.sequence}`} onClose={() => setInspecting(null)}>
          <div className="flex flex-col gap-3 text-[13px]">
            <div>
              <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">Action</p>
              <p className="text-navy">{actionLabel(inspecting.actionType)}</p>
              {/* The raw key stays here on purpose: it is what the CSV export
                  and anything scripting against the log actually match on. */}
              <p className="mt-0.5 font-mono text-[11px] text-text-faint">{inspecting.actionType}</p>
            </div>

            {/* Never shown anywhere before — the table had an Entity column but
                the dialog behind it did not repeat the reference. */}
            <div>
              <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">Record</p>
              <p className="text-text-secondary">{entityLabel(inspecting) ?? '—'}</p>
            </div>
            {inspecting.summary && (
              <div>
                <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">Summary</p>
                <p className="text-text-secondary">{inspecting.summary}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">Actor</p>
                <p className="text-text-secondary">{inspecting.actorName ?? '—'}</p>
              </div>
              <div>
                <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">IP</p>
                <p className="font-mono text-text-secondary">{inspecting.ipAddress ?? '—'}</p>
              </div>
            </div>

            {(inspecting.beforeState || inspecting.afterState) && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">Before</p>
                  <pre className="overflow-x-auto rounded bg-sidebar p-2 text-[11px] text-text-secondary">
                    {JSON.stringify(inspecting.beforeState, null, 1) ?? '—'}
                  </pre>
                </div>
                <div>
                  <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">After</p>
                  <pre className="overflow-x-auto rounded bg-sidebar p-2 text-[11px] text-text-secondary">
                    {JSON.stringify(inspecting.afterState, null, 1) ?? '—'}
                  </pre>
                </div>
              </div>
            )}

            <div>
              <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">Chain</p>
              <p className="font-mono text-[11px] break-all text-text-secondary">
                prev: {inspecting.prevHash}
              </p>
              <p className="font-mono text-[11px] break-all text-navy">hash: {inspecting.hash}</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={() => setInspecting(null)}>
              CLOSE
            </Button>
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}
