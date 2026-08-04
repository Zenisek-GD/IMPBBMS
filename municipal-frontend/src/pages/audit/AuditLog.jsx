import { useEffect, useState } from 'react'
import { ScrollText, ShieldCheck, ShieldAlert, Download, Search } from 'lucide-react'
import * as insightsApi from '../../api/insights'
import { OUTCOME_TONES, auditExportUrl } from '../../api/insights'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { usePagination } from '../../components/ui/usePagination'

export default function AuditLog() {
  const permissions = usePermissions()
  const [entries, setEntries] = useState([])
  const [verification, setVerification] = useState(null)
  const [actorFilter, setActorFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [inspecting, setInspecting] = useState(null)

  useEffect(() => {
    let cancelled = false
    const params = {}
    if (actorFilter) params.actor = actorFilter
    if (outcomeFilter) params.outcome = outcomeFilter

    const timer = setTimeout(() => {
      Promise.all([insightsApi.fetchAuditLog(params), insightsApi.verifyAuditChain()])
        .then(([log, verify]) => {
          if (cancelled) return
          setEntries(log)
          setVerification(verify)
        })
        .catch(() => {})
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [actorFilter, outcomeFilter])

  const canExport = permissions.has('audit.export')

  // Paged client-side: the whole set is already loaded, so this keeps
  // filtering instant while stopping a long list from running off-screen.
  const { pageRows, paginationProps } = usePagination(entries)

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
              placeholder="Filter by actor..."
              className="w-full rounded border border-border-muted py-2 pr-4 pl-9 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </div>
          <select
            value={outcomeFilter}
            onChange={(event) => setOutcomeFilter(event.target.value)}
            className="rounded border border-border-muted px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
          >
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </Card>

      <Card title="Events" icon={ScrollText} bodyClassName="">
        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">No matching events.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  {['#', 'When', 'Action', 'Actor', 'Entity', 'Outcome', 'Chain'].map((head) => (
                    <th
                      key={head}
                      className="px-4 py-2 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap text-text-secondary uppercase"
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((entry) => (
                  <tr
                    key={entry.id}
                    onClick={() => setInspecting(entry)}
                    className="cursor-pointer border-t border-border-muted hover:bg-sidebar"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-text-faint">{entry.sequence}</td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {new Date(entry.recordedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-navy">{entry.actionType}</td>
                    <td className="px-4 py-3 text-[13px] text-navy">
                      {entry.actorName ?? '—'}
                      {entry.actorRole && (
                        <p className="text-[11px] text-text-faint">{entry.actorRole}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">
                      {entry.entityRef ? `${entry.entityRef}#${entry.entityId ?? '—'}` : '—'}
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
              <p className="font-mono text-navy">{inspecting.actionType}</p>
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
