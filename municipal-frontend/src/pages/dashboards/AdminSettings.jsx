import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Settings,
  CheckCircle2,
  ArrowRight,
  Building2,
  Paintbrush,
  Keyboard,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import * as settingsApi from '../../api/settings'
import { LGU_TYPE_LABELS, INCOME_CLASS_LABELS } from '../../api/settings'
import { ROLE_NAV } from '../../config/navigation'
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
//
// ── BRANDING & SHORTCUTS ────────────────────────────────────────────────────
// Two additional admin-only sections:
// 1. System Branding — the system name shown in the top bar, login page, and
//    public portal, plus the transparency portal title and footer text.
// 2. Keyboard Shortcuts — editable Alt+key assignments for every sidebar item
//    across all roles, stored server-side.

const inputClass =
  'w-full rounded-md border border-border-muted bg-surface px-3.5 py-2.5 text-[13.5px] text-navy transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none'

const Field = ({ label, hint, children }) => (
  <div>
    <label className="mb-1.5 block text-[12.5px] font-medium text-text-secondary">{label}</label>
    {children}
    {hint && <p className="mt-1.5 text-[12px] leading-relaxed text-text-faint">{hint}</p>}
  </div>
)

// ── Human-readable role labels ──────────────────────────────────────────────
const ROLE_LABELS = {
  systemAdministrator: 'System Administrator',
  hope: 'Head of Procuring Entity (Mayor)',
  bacChairperson: 'BAC Chairperson',
  bacViceChairperson: 'BAC Vice-Chairperson',
  bacMember: 'BAC Member',
  bacSecretariat: 'BAC Secretariat',
  twgMember: 'Technical Working Group',
  planningOfficer: 'Planning Officer',
  sanggunianSecretary: 'Sanggunian Secretary',
  headOfOffice: 'Head of Office',
  departmentRequester: 'Department Requester',
  budgetOfficer: 'Budget Officer',
  municipalAccountant: 'Municipal Accountant',
  municipalTreasurer: 'Municipal Treasurer',
  vendor: 'Supplier / Vendor',
  observer: 'Observer',
  internalAuditor: 'Internal Auditor',
}

// ── Shortcut editor for a single role ───────────────────────────────────────
function RoleShortcutEditor({ roleKey, sections, overrides, onChange }) {
  const [expanded, setExpanded] = useState(false)

  // Build a flat list of all items for this role
  const items = sections.flatMap((s) => s.items)

  // Current shortcut for an item: override first, then default
  const shortcutFor = (item) => {
    const override = overrides?.find((o) => o.href === item.href)
    return override ? override.shortcut : item.shortcut ?? ''
  }

  const handleChange = (href, value) => {
    // Build updated overrides array
    const existing = overrides ? [...overrides] : []
    const index = existing.findIndex((o) => o.href === href)
    if (index >= 0) {
      existing[index] = { href, shortcut: value }
    } else {
      existing.push({ href, shortcut: value })
    }
    onChange(roleKey, existing)
  }

  return (
    <div className="border-b border-border-muted last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium text-navy transition-colors hover:bg-sidebar"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{ROLE_LABELS[roleKey] ?? roleKey}</span>
        <span className="ml-auto text-[11px] font-normal text-text-faint">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border-muted bg-sidebar/50 px-4 py-2">
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <p className="text-[10.5px] font-medium tracking-[0.04em] text-text-faint uppercase">
              Navigation Item
            </p>
            <p className="text-[10.5px] font-medium tracking-[0.04em] text-text-faint uppercase">
              Shortcut
            </p>
            {items.map((item) => (
              <div key={item.href} className="col-span-2 grid grid-cols-[1fr_auto] items-center gap-4 py-1">
                <span className="truncate text-[13px] text-text-secondary">{item.label}</span>
                <input
                  type="text"
                  value={shortcutFor(item)}
                  placeholder="e.g. Alt+1"
                  onChange={(e) => handleChange(item.href, e.target.value)}
                  className="w-28 rounded-md border border-border-muted bg-surface px-2.5 py-1.5 text-center text-[12px] font-mono text-navy transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminSettings() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ name: '', lguType: 'municipality', incomeClass: '1st' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  // Branding state
  const [brandingForm, setBrandingForm] = useState({
    systemName: '',
    transparencyTitle: '',
    transparencyFooter: '',
  })
  const [savingBranding, setSavingBranding] = useState(false)
  const [savedBranding, setSavedBranding] = useState(false)
  const [brandingError, setBrandingError] = useState('')

  // Shortcuts state — { roleKey: [{ href, shortcut }] }
  const [shortcutOverrides, setShortcutOverrides] = useState({})
  const [savingShortcuts, setSavingShortcuts] = useState(false)
  const [savedShortcuts, setSavedShortcuts] = useState(false)
  const [shortcutError, setShortcutError] = useState('')

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
        if (result.branding) {
          setBrandingForm({
            systemName: result.branding.systemName ?? '',
            transparencyTitle: result.branding.transparencyTitle ?? '',
            transparencyFooter: result.branding.transparencyFooter ?? '',
          })
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load settings.')
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  // Fetch shortcut overrides separately
  useEffect(() => {
    let cancelled = false
    settingsApi
      .fetchNavShortcuts()
      .then((result) => {
        if (!cancelled) setShortcutOverrides(result ?? {})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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

  const saveBranding = async () => {
    setBrandingError('')
    setSavedBranding(false)
    setSavingBranding(true)
    try {
      const result = await settingsApi.updateSettings(brandingForm)
      setData(result)
      setSavedBranding(true)
    } catch (err) {
      setBrandingError(err.response?.data?.message ?? 'Could not save branding.')
    } finally {
      setSavingBranding(false)
    }
  }

  const handleShortcutChange = useCallback((roleKey, items) => {
    setShortcutOverrides((prev) => ({ ...prev, [roleKey]: items }))
    setSavedShortcuts(false)
  }, [])

  const saveShortcuts = async () => {
    setShortcutError('')
    setSavedShortcuts(false)
    setSavingShortcuts(true)
    try {
      await settingsApi.updateNavShortcuts(shortcutOverrides)
      setSavedShortcuts(true)
    } catch (err) {
      setShortcutError(err.response?.data?.message ?? 'Could not save shortcuts.')
    } finally {
      setSavingShortcuts(false)
    }
  }

  const resetShortcuts = () => {
    setShortcutOverrides({})
    setSavedShortcuts(false)
  }

  // A barangay has a single flat ceiling with no income-class breakdown.
  const incomeClassApplies = form.lguType !== 'barangay'

  return (
    <DashboardPage>
      <PageHeader
        title="System Settings"
        subtitle="Configure the system identity, branding, and keyboard shortcuts for all users."
      />

      {/* ── LGU IDENTITY ──────────────────────────────────────────────────── */}
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

      {/* ── SYSTEM BRANDING ──────────────────────────────────────────────── */}
      <Card title="System Branding" icon={Paintbrush}>
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Customise the system name and transparency portal text. These values appear in the top
            navigation bar, the login page, and the public transparency portal — change them here to
            rebrand the system for your municipality.
          </p>

          <div className="grid gap-5 lg:grid-cols-2">
            <Field
              label="System name"
              hint="Displayed in the top bar, login page, and public portal header. Defaults to 'ProcureNance'."
            >
              <input
                type="text"
                value={brandingForm.systemName}
                placeholder="ProcureNance"
                onChange={(e) => setBrandingForm({ ...brandingForm, systemName: e.target.value })}
                className={inputClass}
              />
            </Field>

            <Field
              label="Transparency portal title"
              hint="The title shown on the public transparency portal landing page."
            >
              <input
                type="text"
                value={brandingForm.transparencyTitle}
                placeholder="Transparency Portal"
                onChange={(e) =>
                  setBrandingForm({ ...brandingForm, transparencyTitle: e.target.value })
                }
                className={inputClass}
              />
            </Field>
          </div>

          <Field
            label="Transparency portal footer"
            hint="The disclosure text at the bottom of every public portal page. Leave blank to use the default RA 12009 disclosure."
          >
            <textarea
              value={brandingForm.transparencyFooter}
              placeholder="Published under the Implementing Rules and Regulations of RA No. 12009…"
              onChange={(e) =>
                setBrandingForm({ ...brandingForm, transparencyFooter: e.target.value })
              }
              rows={4}
              className={`${inputClass} resize-y`}
            />
          </Field>

          {brandingError && (
            <p
              role="alert"
              className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger"
            >
              {brandingError}
            </p>
          )}

          {savedBranding && (
            <p className="flex items-center gap-2 rounded-md border border-success/25 bg-success/10 px-3.5 py-2.5 text-[13px] text-success">
              <CheckCircle2 size={15} /> Branding updated — changes are live across the system.
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={saveBranding} disabled={savingBranding || !data}>
              {savingBranding ? 'Saving…' : 'Save branding'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── KEYBOARD SHORTCUTS ───────────────────────────────────────────── */}
      <Card title="Keyboard Shortcuts" icon={Keyboard}>
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-text-secondary">
            Customise the keyboard shortcuts for every sidebar navigation item. Each shortcut uses
            the <kbd className="rounded border border-border-muted bg-sidebar px-1 py-0.5 text-[11px] font-mono">Alt</kbd> key
            plus a number or letter. Changes apply to all users in that role.
          </p>

          <div className="overflow-hidden rounded-md border border-border-muted">
            {Object.entries(ROLE_NAV).map(([roleKey, roleConfig]) => (
              <RoleShortcutEditor
                key={roleKey}
                roleKey={roleKey}
                sections={roleConfig.sections}
                overrides={shortcutOverrides[roleKey]}
                onChange={handleShortcutChange}
              />
            ))}
          </div>

          {shortcutError && (
            <p
              role="alert"
              className="rounded-md border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger"
            >
              {shortcutError}
            </p>
          )}

          {savedShortcuts && (
            <p className="flex items-center gap-2 rounded-md border border-success/25 bg-success/10 px-3.5 py-2.5 text-[13px] text-success">
              <CheckCircle2 size={15} /> Shortcuts saved — they will take effect on next page load.
            </p>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" icon={RotateCcw} onClick={resetShortcuts}>
              Reset to defaults
            </Button>
            <Button onClick={saveShortcuts} disabled={savingShortcuts}>
              {savingShortcuts ? 'Saving…' : 'Save shortcuts'}
            </Button>
          </div>
        </div>
      </Card>
    </DashboardPage>
  )
}
