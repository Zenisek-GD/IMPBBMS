import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark } from 'lucide-react'
import ThemeToggle from '../components/ui/ThemeToggle'
import { fetchPublicBranding } from '../api/settings'

// Shared shell for login / forgot-password / activate-account.
//
// This was a split screen: a dark brand column filling half the viewport with a
// headline and three "assurances", and the form crammed into the other half.
// That panel was marketing copy shown to people who had already chosen to sign
// in — it argued for a product the reader is, by definition, already using, and
// it pushed the only interactive thing on the page off-centre.
//
// It is now a single centred column. Signing in is one short task, and the page
// should be nothing but that task: the mark, the form, and the way back to the
// public portal. The three pages that share this shell stay consistent with each
// other, which is the other reason the change lives here rather than in Login.
//
// ── DYNAMIC SYSTEM NAME ─────────────────────────────────────────────────────
// The wordmark fetches the admin-configured system name from the public
// branding endpoint (no auth required). Falls back to "ProcureNance".
export default function AuthLayout({ title, subtitle, children, footer }) {
  const [systemName, setSystemName] = useState('ProcureNance')

  useEffect(() => {
    let cancelled = false
    fetchPublicBranding()
      .then((branding) => {
        if (!cancelled && branding.systemName) setSystemName(branding.systemName)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-canvas px-5 py-12">
      {/* Available before sign-in, because someone reading in the dark should
          not have to authenticate to turn the lights down. */}
      <div className="absolute top-5 right-5">
        <ThemeToggle />
      </div>

      {/* max-w-[24rem] rather than the old 22rem: with nothing beside it the
          column carries the page on its own, and a slightly wider measure stops
          it reading as a narrow strip stranded in the middle. */}
      <main className="w-full max-w-[24rem]">
        {/* The mark now sits above the form on every breakpoint. It used to be
            hidden on desktop, because the brand column carried it there — with
            that column gone, the page would otherwise open with no indication
            of what system is being signed in to. */}
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Landmark size={18} />
          </span>
          <span className="text-[16px] font-semibold tracking-[-0.01em] text-navy">{systemName}</span>
        </Link>

        <div className="text-center">
          <h2 className="text-[21px] leading-tight font-semibold tracking-[-0.02em] text-navy">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{subtitle}</p>
          )}
        </div>

        {/* The form itself stays left-aligned inside the centred column —
            centring labels and inputs would make every field start at a
            different x and slow the eye down the form. */}
        <div className="mt-7 text-left">{children}</div>

        {footer && <div className="mt-6 text-center text-[13px]">{footer}</div>}
      </main>

      <p className="absolute bottom-6 text-[11px] tracking-[0.05em] text-text-faint uppercase">
        Municipal LGU Internal System
      </p>
    </div>
  )
}
