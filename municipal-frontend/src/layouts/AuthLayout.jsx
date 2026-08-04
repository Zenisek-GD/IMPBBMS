import { Link } from 'react-router-dom'
import { Landmark, ShieldCheck, ScrollText, Eye } from 'lucide-react'
import ThemeToggle from '../components/ui/ThemeToggle'

// Shared split shell for login / forgot-password / reset-password so all three
// keep the same branding and form column.
//
// The brand side was a flat rectangle with three lines of text stacked in it.
// It now says what the system actually guarantees — a named decision-maker on
// every action, an audit trail that can be checked, and a public record — which
// is both more useful to the person signing in and the honest pitch for the
// product. The texture and wash come from index.css and sit on the brand
// colour, which stays dark in both themes.
const ASSURANCES = [
  {
    icon: ShieldCheck,
    title: 'Accountable by design',
    body: 'Every approval, certification and release is recorded against a named officer and their role.',
  },
  {
    icon: ScrollText,
    title: 'Tamper-evident trail',
    body: 'Each entry is hash-chained to the one before it, so a record cannot be quietly rewritten.',
  },
  {
    icon: Eye,
    title: 'Public by default',
    body: 'Approved plans, awards and disbursements are published as they happen — no account required.',
  },
]

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen bg-canvas">
      {/* ── Brand column ──────────────────────────────────────────────────── */}
      <div className="pattern-grid hero-wash hidden w-1/2 flex-col justify-between bg-brand p-10 lg:flex xl:p-14">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-brand-fg">
            <Landmark size={17} />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-brand-fg">CivicBid</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-brand-fg xl:text-[34px]">
            Municipal procurement, on the record.
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-topnav-link">
            Annual Procurement Plans, requisitions, bidding and awards — tracked end to end and aligned with
            RA 12009.
          </p>

          <ul className="mt-9 flex flex-col gap-5">
            {ASSURANCES.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-brand-fg">
                  <item.icon size={14} />
                </span>
                <div>
                  <p className="text-[13px] font-medium text-brand-fg">{item.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-topnav-link">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] tracking-[0.05em] text-topnav-link uppercase">
          Municipal LGU Internal System
        </p>
      </div>

      {/* ── Form column ───────────────────────────────────────────────────── */}
      <div className="relative flex w-full flex-col items-center justify-center px-5 py-12 lg:w-1/2">
        {/* Available before sign-in, because someone reading in the dark should
            not have to authenticate to turn the lights down. */}
        <div className="absolute top-5 right-5">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[22rem]">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Landmark size={17} />
            </span>
            <span className="text-[15px] font-semibold text-navy">CivicBid</span>
          </Link>

          <h2 className="text-[20px] leading-tight font-semibold tracking-[-0.02em] text-navy">{title}</h2>
          {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{subtitle}</p>}

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-center text-[13px]">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
