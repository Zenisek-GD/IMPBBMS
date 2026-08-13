import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  RadioTower,
  DatabaseZap,
  RefreshCw,
  Fingerprint,
} from 'lucide-react'
import * as securityApi from '../../api/security'
import {
  SEVERITY_TONES,
  STATUS_TONES,
  STATUS_LABELS,
  ALERT_EXPLANATIONS,
} from '../../api/security'
import { usePermissions } from '../../context/usePermissions'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import StatCard from '../../components/ui/StatCard'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh from '../../components/ui/SortableTh'
import Pagination from '../../components/ui/Pagination'
import { useTableControls } from '../../components/ui/useTableControls'
import { usePagination } from '../../components/ui/usePagination'

// How long the monitor may stay silent before the silence is itself the
// problem. The scheduled sweep runs every 30 minutes by default, so anything
// past two hours means it is not running — and a monitor that has stopped
// reports "no findings" exactly like a clean system does.
const STALE_HOURS = 2

export default function SecurityConsole() {
  const permissions = usePermissions()
  const canManage = permissions.has('security.manage')

  const [overview, setOverview] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [scanning, setScanning] = useState(false)
  const [inspecting, setInspecting] = useState(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)

  // `now` is stamped here rather than read during render: the age of the last
  // scan must not change between two renders of identical props. Taking it
  // where the data arrives also makes the two consistent — the age shown always
  // belongs to the figures shown.
  const [now, setNow] = useState(null)

  const load = useCallback(
    () =>
      Promise.all([securityApi.fetchSecurityOverview(), securityApi.fetchAlerts()])
        .then(([summary, rows]) => {
          setOverview(summary)
          setAlerts(rows)
          setNow(Date.now())
        })
        .catch(() => setError('Could not load the security console.')),
    []
  )

  useEffect(() => {
    load()
  }, [load])

  const runScan = async () => {
    setScanning(true)
    setError(null)
    try {
      const result = await securityApi.runScan()
      await load()
      if (result.findings === 0) setError(null)
    } catch {
      setError('The scan could not be completed.')
    } finally {
      setScanning(false)
    }
  }

  const close = async (status) => {
    try {
      await securityApi.updateAlert(inspecting.id, { status, note })
      setInspecting(null)
      setNote('')
      await load()
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Could not update the alert.')
    }
  }

  // Ticked once a minute so the staleness warning appears on its own if this
  // screen is left open, rather than only on reload. Ample for a threshold
  // measured in hours.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const lastScanAgeHours = useMemo(() => {
    if (!now || !overview?.lastScanAt) return null
    return (now - new Date(overview.lastScanAt).getTime()) / 3_600_000
  }, [now, overview])

  // Only claimed once the clock has actually ticked. Before that the age is
  // unknown, and reporting "monitoring may have stopped" on the first frame of
  // every visit would train the reader to ignore the one banner that matters.
  const monitoringStale =
    now !== null && (!overview?.lastScanAt || lastScanAgeHours > STALE_HOURS)

  const table = useTableControls(alerts, {
    searchKeys: (alert) => [alert.typeLabel, alert.summary, alert.entityRef].filter(Boolean).join(' '),
    filters: [
      {
        key: 'severity',
        label: 'All severities',
        options: [
          { value: 'critical', label: 'Critical' },
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
        ],
      },
      {
        key: 'status',
        label: 'All statuses',
        options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
      },
    ],
    initialSort: { key: 'lastSeenAt', direction: 'desc' },
  })

  const { pageRows, paginationProps } = usePagination(table.rows)

  const openCritical = alerts.filter(
    (a) => a.severity === 'critical' && (a.status === 'open' || a.status === 'acknowledged')
  ).length

  return (
    <DashboardPage>
      <PageHeader
        title="Security Monitoring"
        subtitle="Changes made outside the system, and behaviour inside it that warrants a look"
        icon={ShieldAlert}
        actions={
          canManage && (
            <Button icon={RefreshCw} onClick={runScan} disabled={scanning}>
              {scanning ? 'SCANNING…' : 'RUN SCAN NOW'}
            </Button>
          )
        }
      />

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* The headline verdict. A console that opens on a table of rows makes the
          reader work out the state for themselves; this says it outright.
          Held back until the data is in — a verdict rendered before the figures
          arrive is a guess. */}
      {overview && (
      <div
        className={`flex items-start gap-3 rounded-lg border p-4 ${
          openCritical > 0
            ? 'border-danger/40 bg-danger/10'
            : monitoringStale
              ? 'border-warning/40 bg-warning/10'
              : 'border-success/30 bg-success/10'
        }`}
      >
        {openCritical > 0 ? (
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-danger" />
        ) : monitoringStale ? (
          <RadioTower size={18} className="mt-0.5 shrink-0 text-warning" />
        ) : (
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
        )}
        <div className="min-w-0">
          {openCritical > 0 ? (
            <p className="text-[13px] font-semibold text-danger">
              {openCritical} critical finding{openCritical === 1 ? '' : 's'} open — records were
              changed without going through the system, or a role’s powers were altered.
            </p>
          ) : monitoringStale ? (
            /* Deliberately its own state rather than being folded into "all
               clear". A monitor that has stopped running reports no findings in
               exactly the same way a clean system does, and treating the two
               alike is how tampering sits undetected for a month. */
            <p className="text-[13px] font-semibold text-warning">
              {overview?.lastScanAt
                ? `No scan in ${Math.floor(lastScanAgeHours)} hours — monitoring may have stopped.`
                : 'No scan has ever run. Nothing is being monitored yet.'}
            </p>
          ) : (
            <p className="text-[13px] font-semibold text-success">
              No critical findings. {overview?.recordsUnderWatch ?? 0} records fingerprinted and
              matching.
            </p>
          )}
          {overview?.lastScanSummary && (
            <p className="mt-1 text-xs text-text-secondary">{overview.lastScanSummary}</p>
          )}
          {overview?.lastScanAt && (
            <p className="mt-1 text-[11px] text-text-faint">
              last scan: {new Date(overview.lastScanAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open alerts"
          value={overview?.openAlerts ?? '—'}
          icon={ShieldAlert}
          tone={overview?.openAlerts > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Critical"
          value={overview?.bySeverity?.critical ?? '—'}
          icon={DatabaseZap}
          tone={overview?.bySeverity?.critical > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Records watched"
          value={overview?.recordsUnderWatch ?? '—'}
          hint={`${overview?.watchedEntities?.length ?? 0} tables`}
          icon={Fingerprint}
        />
        <StatCard
          label="Scan interval"
          value="30 min"
          hint="automatic, plus on demand"
          icon={RadioTower}
        />
      </div>

      <Card bodyClassName="p-4">
        <TableToolbar {...table.toolbarProps} searchPlaceholder="Search findings…" />
      </Card>

      <Card title="Findings" icon={ShieldAlert} bodyClassName="">
        {table.rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-text-faint">
            {table.totalBeforeFilters === 0
              ? 'Nothing has been flagged.'
              : 'No findings match your search or filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('severity')}>Severity</SortableTh>
                  <SortableTh {...table.sortProps('typeLabel')}>Finding</SortableTh>
                  <SortableTh {...table.sortProps('lastSeenAt')}>Last seen</SortableTh>
                  <SortableTh {...table.sortProps('occurrences')}>Seen</SortableTh>
                  <SortableTh {...table.sortProps('status')}>Status</SortableTh>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((alert) => (
                  <tr
                    key={alert.id}
                    onClick={() => {
                      setInspecting(alert)
                      setNote(alert.resolutionNote ?? '')
                    }}
                    className="cursor-pointer border-t border-border-muted align-top hover:bg-sidebar"
                  >
                    <td className="px-4 py-3">
                      <Badge tone={SEVERITY_TONES[alert.severity]}>{alert.severity}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] text-navy">{alert.typeLabel}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-text-faint">
                        {alert.summary}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[13px] whitespace-nowrap text-text-secondary">
                      {new Date(alert.lastSeenAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-text-secondary">
                      {alert.occurrences}×
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[alert.status]}>{STATUS_LABELS[alert.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...paginationProps} label="findings" />
      </Card>

      {inspecting && (
        <Modal
          title={inspecting.typeLabel}
          subtitle={`First seen ${new Date(inspecting.firstSeenAt).toLocaleString()}`}
          size="lg"
          onClose={() => setInspecting(null)}
        >
          <div className="flex flex-col gap-3 text-[13px]">
            <div className="flex flex-wrap gap-2">
              <Badge tone={SEVERITY_TONES[inspecting.severity]}>{inspecting.severity}</Badge>
              <Badge tone={STATUS_TONES[inspecting.status]}>
                {STATUS_LABELS[inspecting.status]}
              </Badge>
              {inspecting.entityRef && (
                <Badge>
                  {inspecting.entityRef}
                  {inspecting.entityId ? ` #${inspecting.entityId}` : ''}
                </Badge>
              )}
            </div>

            <div>
              <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">What happened</p>
              <p className="text-navy">{inspecting.summary}</p>
            </div>

            {/* Without this the reader is left to infer the meaning of the
                finding from its name, and act on a guess. */}
            {ALERT_EXPLANATIONS[inspecting.type] && (
              <div className="rounded-lg border border-border-muted bg-sidebar p-3">
                <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">
                  What this means
                </p>
                <p className="mt-1 text-text-secondary">{ALERT_EXPLANATIONS[inspecting.type]}</p>
              </div>
            )}

            {inspecting.detail && (
              <div>
                <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">Evidence</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-border-muted bg-sidebar p-3 font-mono text-[11px] text-text-secondary">
                  {JSON.stringify(inspecting.detail, null, 2)}
                </pre>
              </div>
            )}

            {inspecting.resolutionNote && (
              <div>
                <p className="text-[11px] tracking-[0.03em] text-text-faint uppercase">
                  Recorded finding
                </p>
                <p className="text-text-secondary">{inspecting.resolutionNote}</p>
                {inspecting.resolvedByName && (
                  <p className="mt-0.5 text-[11px] text-text-faint">
                    {inspecting.resolvedByName} ·{' '}
                    {inspecting.resolvedAt && new Date(inspecting.resolvedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {canManage && inspecting.status !== 'resolved' && (
              <div className="border-t border-border-muted pt-3">
                <label className="text-[11px] tracking-[0.03em] text-text-faint uppercase">
                  What did you find?
                </label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="e.g. Traced to the 12 Aug data migration; change was authorised by the Budget Officer."
                  className="mt-1 w-full rounded-lg border border-border-muted bg-surface p-2 text-[13px] text-navy"
                />
                <p className="mt-1 text-[11px] text-text-faint">
                  Required to resolve or dismiss. An alert closed without a reason tells the next
                  reviewer nothing.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => close('acknowledged')}>
                    ACKNOWLEDGE
                  </Button>
                  <Button onClick={() => close('resolved')} disabled={!note.trim()}>
                    RESOLVE
                  </Button>
                  <Button variant="secondary" onClick={() => close('dismissed')} disabled={!note.trim()}>
                    DISMISS
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </DashboardPage>
  )
}
