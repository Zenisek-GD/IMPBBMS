import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings, CheckCircle2, ArrowRight, Building2 } from 'lucide-react'
import * as settingsApi from '../../api/settings'
import { LGU_TYPE_LABELS, INCOME_CLASS_LABELS } from '../../api/settings'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'

// ── SYSTEM SETTINGS ──────────────────────────────────────────────────────────
// This page and /admin/thresholds used to be the same component behind two
// sidebar links, so "Thresholds" went nowhere different — a decorative entry in
// the administrator's rail.
//
// They are two different things and now two different screens. This one holds
// the handful of facts an administrator *sets*: who this LGU is. The ceilings
// those facts produce are a statutory consequence, not a setting, and they live
// on their own read-only page.

const inputClass =
  'w-full rounded-md border border-border-muted bg-surface px-3.5 py-2.5 text-[13.5px] text-navy transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none'

const Field = ({ label, hint, children }) => (
  <div>
    <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">{label}</label>
    {children}
    {hint && <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">{hint}</p>}
  </div>
)

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
        subtitle="Who this LGU is. These three facts identify the deployment and determine the procurement ceilings it operates under."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Local Government Unit" icon={Building2} className="lg:col-span-2">
          <div className="flex flex-col gap-5">
            <Field
              label="LGU name"
              hint="Shown in the top bar, on the public portal, and on every document this system produces."
            >
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className={inputClass}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="LGU type">
                <select
                  value={form.lguType}
                  onChange={(event) => setForm({ ...form, lguType: event.target.value })}
                  className={inputClass}
                >
                  {(data?.options.lguTypes ?? []).map((type) => (
                    <option key={type} value={type}>
                      {LGU_TYPE_LABELS[type] ?? type}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Income classification"
                hint={
                  incomeClassApplies
                    ? 'Set by Department of Finance order — not by this office.'
                    : 'Barangays have a single flat ceiling, so no income class applies.'
                }
              >
                <select
                  value={form.incomeClass}
                  disabled={!incomeClassApplies}
                  onChange={(event) => setForm({ ...form, incomeClass: event.target.value })}
                  className={`${inputClass} disabled:bg-sidebar disabled:text-text-faint`}
                >
                  {(data?.options.incomeClasses ?? []).map((incomeClass) => (
                    <option key={incomeClass} value={incomeClass}>
                      {INCOME_CLASS_LABELS[incomeClass] ?? incomeClass}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger"
              >
                {error}
              </p>
            )}

            {saved && (
              <p className="flex items-center gap-2 rounded-md border border-success/25 bg-success/10 px-3.5 py-2.5 text-[13px] text-success">
                <CheckCircle2 size={15} /> Settings saved — the ceilings have been recalculated.
              </p>
            )}

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || !data}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </div>
        </Card>

        {/* The consequence of the form beside it, stated rather than duplicated.
            An administrator changing the income class needs to know it moves a
            statutory ceiling, and needs one click to go and check which. */}
        <Card title="What these determine" icon={Settings}>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] leading-relaxed text-text-secondary">
              The LGU type and income classification set the ceilings for every alternative mode of
              procurement under RA 12009. Changing either one changes what this municipality may buy
              without competitive bidding.
            </p>

            {data && (
              <div className="rounded-md border border-border-muted bg-sidebar px-3.5 py-3">
                <p className="text-[11.5px] tracking-[0.04em] text-text-faint uppercase">
                  Currently in force
                </p>
                <p className="mt-1 text-[13.5px] text-navy">
                  {LGU_TYPE_LABELS[data.lgu.lguType] ?? data.lgu.lguType}
                  {data.lgu.lguType !== 'barangay' &&
                    ` · ${INCOME_CLASS_LABELS[data.lgu.incomeClass] ?? data.lgu.incomeClass}`}
                </p>
                <p className="mt-1 text-[12px] text-text-faint">
                  {Object.keys(data.thresholds).length} ceilings derived
                </p>
              </div>
            )}

            <Link
              to="/admin/thresholds"
              className="group flex items-center justify-between gap-3 rounded-md border border-border-muted px-3.5 py-3 transition-colors hover:bg-sidebar"
            >
              <span className="text-[13px] font-medium text-navy">View procurement thresholds</span>
              <ArrowRight
                size={15}
                className="shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </Card>
      </div>
    </DashboardPage>
  )
}
