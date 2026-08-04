import { useEffect, useState } from 'react'
import { Settings, ShieldCheck, Info, CheckCircle2 } from 'lucide-react'
import * as settingsApi from '../../api/settings'
import { LGU_TYPE_LABELS, INCOME_CLASS_LABELS } from '../../api/settings'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import { IRR_SOURCE } from '../../config/eligibilityRequirements'

const peso = (value) => `₱${Number(value).toLocaleString('en-PH')}`

export default function AdminSettings() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ name: '', lguType: 'municipality', incomeClass: '1st' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    settingsApi
      .fetchSettings()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setForm({
          name: result.lgu.name,
          lguType: result.lgu.lguType,
          incomeClass: result.lgu.incomeClass,
        })
      })
      .catch(() => {
        if (!cancelled) setError('Could not load settings.')
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const save = async () => {
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      const result = await settingsApi.updateSettings(form)
      setData(result)
      setSaved(true)
      setRefreshToken((token) => token + 1)
    } catch (err) {
      setError(err.response?.data?.message ?? 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  // A barangay has a single flat ceiling with no income-class breakdown.
  const incomeClassApplies = form.lguType !== 'barangay'

  return (
    <DashboardPage>
      <PageHeader
        title="System Settings"
        subtitle="Identity of this LGU, and the procurement ceilings it determines under RA 12009."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Local Government Unit" icon={Settings}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
                LGU name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
                LGU type
              </label>
              <select
                value={form.lguType}
                onChange={(event) => setForm({ ...form, lguType: event.target.value })}
                className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy focus:border-navy focus:outline-none"
              >
                {(data?.options.lguTypes ?? []).map((type) => (
                  <option key={type} value={type}>
                    {LGU_TYPE_LABELS[type] ?? type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.02em] text-text-secondary">
                Income classification
              </label>
              <select
                value={form.incomeClass}
                disabled={!incomeClassApplies}
                onChange={(event) => setForm({ ...form, incomeClass: event.target.value })}
                className="w-full rounded border border-border-muted px-4 py-2 text-sm text-navy disabled:bg-sidebar disabled:text-text-faint focus:border-navy focus:outline-none"
              >
                {(data?.options.incomeClasses ?? []).map((incomeClass) => (
                  <option key={incomeClass} value={incomeClass}>
                    {INCOME_CLASS_LABELS[incomeClass] ?? incomeClass}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-text-faint">
                {incomeClassApplies
                  ? 'Set by Department of Finance order. Changing it changes the Small Value Procurement ceiling.'
                  : 'Barangays have a single flat ceiling, so no income class applies.'}
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            {saved && (
              <p className="flex items-center gap-2 rounded border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
                <CheckCircle2 size={15} /> Settings saved — thresholds updated.
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={save}
                disabled={saving || !data}
                className="rounded-sm bg-accent px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-accent-fg disabled:opacity-60"
              >
                {saving ? 'SAVING...' : 'SAVE SETTINGS'}
              </button>
            </div>
          </div>
        </Card>

        <Card title="Resulting Procurement Thresholds" icon={ShieldCheck}>
          {!data ? (
            <p className="text-[13px] text-text-faint">Loading...</p>
          ) : (
            <>
              <div className="flex flex-col">
                {Object.entries(data.thresholds).map(([key, threshold]) => (
                  <div key={key} className="flex items-start justify-between gap-4 border-b border-border-muted py-3 last:border-0">
                    <div>
                      <p className="text-[13px] text-navy">{threshold.label}</p>
                      <p className="font-mono text-[11px] text-text-faint">{threshold.citation}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-navy">{peso(threshold.amount)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-start gap-2 rounded border border-navy/10 bg-chip/40 p-3">
                <Info size={14} className="mt-0.5 shrink-0 text-navy" />
                <p className="text-xs text-text-secondary">
                  These are derived from the{' '}
                  <a href={IRR_SOURCE.url} target="_blank" rel="noreferrer" className="text-navy underline">
                    IRR of RA No. 12009
                  </a>{' '}
                  and applied wherever an ABC is entered. Competitive Bidding is the default mode and has no
                  ceiling — only alternative modes are limited.
                </p>
              </div>
            </>
          )}
        </Card>
      </div>
    </DashboardPage>
  )
}
