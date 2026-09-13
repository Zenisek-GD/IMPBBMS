// ── Full-page form scaffold (System_Simplification Item 12) ────────────────────
// A modal is only for small, focused work: confirming an action, entering a
// short reason, adding one simple item, viewing brief information, or editing
// a short status detail.
//
// Everything below belongs on a full page instead of inside a scroll-heavy
// modal: development plans, AIP creation and project entry, procurement setup,
// bid evaluation, contract preparation, large document creation, multi-field
// user management, financial forms, and complex approval or review screens.
//
// This scaffold enforces the structure Item 12 requires for those pages:
//   · a clear title plus a short explanation of the purpose
//   · logical sections (LargeFormPage.Section) instead of one long scroll
//   · a progress indicator when the work has multiple steps (`steps` prop)
//   · Cancel / Back, Save draft where drafts exist, and exactly one visually
//     dominant primary action
//   · validation rendered next to the field that failed (the form's own job —
//     this component only provides the `error` slot for form-wide failures)
//
// Usage: when a create/edit state is active, the page returns early with
// <DashboardPage><LargeFormPage …>…</LargeFormPage></DashboardPage> instead of
// rendering the list with a modal on top. TemplateManager's TemplateEditor is
// the established example of that pattern.
import { ArrowLeft, Check } from 'lucide-react'

export function FormSection({ title, description, children }) {
  return (
    <section className="rounded-lg border border-border-muted bg-surface p-5 shadow-sm">
      {title && <h2 className="text-[15px] font-semibold text-navy">{title}</h2>}
      {description && (
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-text-secondary">
          {description}
        </p>
      )}
      <div className={title || description ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

function Steps({ steps }) {
  if (!steps?.length) return null
  return (
    <ol aria-label="Progress" className="flex flex-wrap gap-2">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === 'active' ? 'step' : undefined}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] ${
            step.state === 'done'
              ? 'border-success/30 bg-success/10 text-navy'
              : step.state === 'active'
                ? 'border-accent bg-accent/10 font-medium text-navy'
                : 'border-border-muted text-text-faint'
          }`}
        >
          <span
            className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
              step.state === 'done'
                ? 'bg-success text-white'
                : step.state === 'active'
                  ? 'bg-accent text-accent-fg'
                  : 'bg-track text-text-faint'
            }`}
          >
            {step.state === 'done' ? <Check size={11} /> : index + 1}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  )
}

export default function LargeFormPage({
  title,
  purpose,
  steps,
  onBack,
  backLabel = 'Back',
  error,
  actions,
  children,
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-navy hover:underline"
          >
            <ArrowLeft size={14} /> {backLabel}
          </button>
        )}
        <h1 className="text-[24px] leading-[1.12] font-semibold tracking-[-0.025em] text-navy">
          {title}
        </h1>
        {purpose && (
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-text-secondary">
            {purpose}
          </p>
        )}
      </div>

      <Steps steps={steps} />

      {error && (
        <p
          role="alert"
          className="rounded border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">{children}</div>

      {actions && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-border-muted bg-canvas/95 px-1 py-3 backdrop-blur">
          <p className="max-w-xl text-[12px] leading-relaxed text-text-secondary">
            <span className="font-medium text-navy">Review before you continue.</span> Required information and any validation message should be resolved before the primary action.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>
      )}
    </div>
  )
}

LargeFormPage.Section = FormSection
