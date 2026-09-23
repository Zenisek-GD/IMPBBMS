// Shared footer for the public portal. The disclosure about what is and is not
// published belongs on every public page, not just the index — a citizen who
// lands directly on a project deserves the same statement of scope.
//
// The footer text is configurable by the system administrator through System
// Settings → Branding, so a different deployment can adjust the disclosure to
// its own context. Falls back to the default RA 12009 disclosure.
import { Link } from 'react-router-dom'
import BrandMark from '../brand/BrandMark'

const DEFAULT_FOOTER =
  'Published under the Implementing Rules and Regulations of RA No. 12009 (New Government Procurement ' +
  'Act). These pages show approved and published records only. Drafts, internal deliberations, evaluator ' +
  'identities and individual bid scores are not published — blind evaluation depends on the scorer ' +
  'remaining unidentified. Figures are as recorded by the Bids and Awards Committee. For records not ' +
  'shown here, file a request with the BAC Secretariat.'

export default function PublicFooter({ transparencyFooter, lguName, lguAddress, systemName }) {
  const portalName = lguName ? `${lguName} Procurement Record` : (systemName ?? 'Procurement Transparency Portal')
  // 44px touch targets on mobile: footer links were ~20px tall inline text.
  const footerLinkClass =
    'inline-flex min-h-11 items-center justify-center px-2 py-1.5 text-text-secondary transition-colors hover:text-navy hover:underline md:justify-start md:px-0'
  return (
    <footer className="mt-8 border-t border-border-muted bg-surface">
      <div className="mx-auto grid max-w-7xl gap-9 px-4 py-10 sm:px-8 md:grid-cols-[minmax(13rem,1.1fr)_minmax(0,2fr)] md:gap-12 md:py-12">
        <div className="mx-auto w-fit max-w-full min-w-0 text-left md:mx-0 md:w-auto">
          <div className="flex min-w-0 items-center justify-start gap-2.5">
            <BrandMark className="size-8" alt="" />
            <p className="min-w-0 break-words text-[15px] font-semibold text-navy">{systemName || 'ProcureNance'}</p>
          </div>
          <p className="mt-1 break-words text-[12.5px] leading-relaxed text-text-secondary">{portalName}</p>
          {lguAddress && <p className="mt-2 break-words text-[13px] leading-relaxed text-text-faint">{lguAddress}</p>}
        </div>

        <div className="mx-auto grid w-full max-w-sm grid-cols-1 gap-x-9 gap-y-8 text-center min-[420px]:grid-cols-2 sm:max-w-none sm:grid-cols-3 md:mx-0 md:text-left">
          <nav aria-label="Portal sections">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-faint uppercase">Portal</p>
            <ul className="mt-1 flex flex-col text-[13px]">
              <li><Link to="/" className={footerLinkClass}>Home</Link></li>
              <li><Link to="/?view=projects" className={footerLinkClass}>Projects</Link></li>
              <li><Link to="/?view=announcements" className={footerLinkClass}>Announcements</Link></li>
              <li><Link to="/?view=officials" className={footerLinkClass}>Officials</Link></li>
              <li><Link to="/?view=about" className={footerLinkClass}>About</Link></li>
            </ul>
          </nav>
          <nav aria-label="Procurement law and help">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-faint uppercase">Law & help</p>
            <ul className="mt-1 flex flex-col text-[13px]">
              <li><Link to="/?view=about" className={footerLinkClass}>What is published and why</Link></li>
              <li><Link to="/?view=about#bidder" className={footerLinkClass}>How to become a bidder</Link></li>
              <li><Link to="/?view=about#contact" className={footerLinkClass}>Report an error</Link></li>
              <li>
                <a
                  href="https://www.gppb.gov.ph"
                  target="_blank"
                  rel="noreferrer"
                  className={footerLinkClass}
                >
                  GPPB / RA 12009 resources
                </a>
              </li>
            </ul>
          </nav>
          <div className="col-span-1 mx-auto w-full max-w-[15rem] min-[420px]:col-span-2 sm:col-span-1 sm:mx-0">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-faint uppercase">Account</p>
            <ul className="mt-1 flex flex-col text-[13px]">
              <li><Link to="/login" className={footerLinkClass}>Sign in for officials & bidders</Link></li>
              <li><span className="inline-block px-2 py-1.5 text-[13px] leading-relaxed text-text-faint">Browsing these records needs no account.</span></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-border-muted bg-sidebar">
        <div className="mx-auto grid max-w-7xl gap-3 px-4 py-5 sm:px-8 md:grid-cols-[11rem_minmax(0,1fr)] md:items-start md:gap-8 md:py-6">
          <p className="text-center text-[11px] font-semibold tracking-[0.06em] text-text-faint uppercase md:pt-0.5 md:text-left">
            Public disclosure
          </p>
          <p className="mx-auto max-w-4xl text-left text-[12.5px] leading-6 text-text-secondary md:mx-0">
            {transparencyFooter || DEFAULT_FOOTER}
          </p>
        </div>
      </div>
    </footer>
  )
}
