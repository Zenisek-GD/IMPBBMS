import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Info, Scale, ExternalLink, Settings } from 'lucide-react'
import * as settingsApi from '../../api/settings'
import { LGU_TYPE_LABELS, INCOME_CLASS_LABELS } from '../../api/settings'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import TableToolbar from '../../components/ui/TableToolbar'
import SortableTh from '../../components/ui/SortableTh'
import { useTableControls } from '../../components/ui/useTableControls'
import { IRR_SOURCE } from '../../config/eligibilityRequirements'

// ── PROCUREMENT THRESHOLDS ───────────────────────────────────────────────────
// Its own page at last. The administrator's sidebar had a "Thresholds" link
// that rendered the settings screen, so the two entries went to one place.
//
// Read-only by design, and that is the point worth making on the screen itself:
// these are not configuration. They are a statutory consequence of the LGU's
// type and income class under RA 12009, and the only way to move one is to
// correct the identity on the settings page — which an administrator should only
// do because a Department of Finance order says so.

const peso = (value) => `₱${Number(value).toLocaleString('en-PH')}`

export default function AdminThresholds() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    settingsApi
      .fetchSettings()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the thresholds.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Flattened so the table can sort on the ceiling as a number rather than on
  // the formatted peso string.
  const rows = Object.entries(data?.thresholds ?? {}).map(([key, threshold]) => ({
    id: key,
    mode: threshold.label,
    citation: threshold.citation,
    amount: Number(threshold.amount ?? 0),
  }))

  const table = useTableControls(rows, {
    searchKeys: ['mode', 'citation'],
    accessors: { amount: (row) => row.amount },
    initialSort: { key: 'amount', direction: 'asc' },
    pageSize: 25,
  })

  return (
    <DashboardPage>
      <PageHeader
        title="Procurement Thresholds"
        subtitle="The ceilings this municipality operates under. Derived from its type and income class — not configured here."
        actions={
          data && (
            <Badge tone="info">
              {LGU_TYPE_LABELS[data.lgu.lguType] ?? data.lgu.lguType}
              {data.lgu.lguType !== 'barangay' &&
                ` · ${INCOME_CLASS_LABELS[data.lgu.incomeClass] ?? data.lgu.incomeClass}`}
            </Badge>
          )
        }
      />

      {error && (
        <p role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          {error}
        </p>
      )}

      {/* Stated once, at the top, because it is the thing most likely to be
          misread: competitive bidding is the default and has no ceiling. Every
          figure below is a limit on *not* bidding. */}
      <div className="flex items-start gap-3 rounded-lg border border-border-muted bg-surface p-5 shadow-sm">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-info-soft text-info">
          <Scale size={16} />
        </span>
        <div>
          <p className="text-[13.5px] leading-relaxed text-text-secondary">
            <strong className="text-navy">Competitive bidding is the default mode and has no
            ceiling.</strong>{' '}
            Every figure below is a limit on an <em>alternative</em> mode — the most this
            municipality may spend without going to open competition. The system applies them
            wherever an ABC is entered, and a requisition above a ceiling cannot use that mode.
          </p>
        </div>
      </div>

      <Card title="Ceilings in force" icon={ShieldCheck} bodyClassName="">
        {rows.length > 0 && (
          <div className="border-b border-border-muted p-5">
            <TableToolbar {...table.toolbarProps} searchPlaceholder="Search mode or citation…" />
          </div>
        )}

        {!data ? (
          <p className="px-5 py-10 text-center text-[13px] text-text-faint">Loading thresholds…</p>
        ) : table.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-text-faint">
            {rows.length === 0
              ? 'No thresholds are defined for this LGU type.'
              : 'No modes match your search.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-sidebar">
                <tr>
                  <SortableTh {...table.sortProps('mode')}>Mode of procurement</SortableTh>
                  <SortableTh {...table.sortProps('citation')}>Legal basis</SortableTh>
                  <SortableTh {...table.sortProps('amount')}>Ceiling</SortableTh>
                </tr>
              </thead>
              <tbody>
                {table.pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-border-muted">
                    <td className="px-5 py-3.5 text-[13.5px] text-navy">{row.mode}</td>
                    <td className="px-5 py-3.5 font-mono text-[12px] text-text-faint">
                      {row.citation}
                    </td>
                    <td className="px-5 py-3.5 text-[14px] font-semibold whitespace-nowrap text-navy tabular-nums">
                      {peso(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Where these come from" icon={Info}>
          <p className="text-[13px] leading-relaxed text-text-secondary">
            These figures are read from the Implementing Rules and Regulations of RA No. 12009 for
            this LGU&rsquo;s type and income class. They are not editable, and they are not a matter
            of local policy — a municipality cannot raise its own ceiling.
          </p>
          <a
            href={IRR_SOURCE.url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-info hover:underline"
          >
            IRR of RA No. 12009 <ExternalLink size={13} />
          </a>
        </Card>

        <Card title="To change a ceiling" icon={Settings}>
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Correct the LGU&rsquo;s income classification on the settings page. Do that only on the
            authority of a Department of Finance order reclassifying this municipality — the
            ceilings will move for every requisition raised afterwards, and the change is recorded
            in the audit trail.
          </p>
          <Link
            to="/admin/settings"
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-navy hover:underline"
          >
            Go to System Settings
          </Link>
        </Card>
      </div>
    </DashboardPage>
  )
}
