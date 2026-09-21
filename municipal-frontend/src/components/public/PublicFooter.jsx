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
  return (
    <footer className="mt-8 border-t border-border-muted bg-surface">
      <div className="mx-auto grid max-w-7xl gap-9 px-4 py-10 sm:px-8 md:grid-cols-[minmax(13rem,1.1fr)_minmax(0,2fr)] md:gap-12 md:py-12">
        <div className="mx-auto w-fit max-w-full text-left md:mx-0 md:w-auto">
          <div className="flex items-center justify-start gap-2.5">
            <BrandMark className="size-8" alt="" />
            <p className="text-[15px] font-semibold text-navy">{systemName || 'ProcureNance'}</p>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">{portalName}</p>
          {lguAddress && <p className="mt-2 text-[12px] leading-relaxed text-text-faint">{lguAddress}</p>}
        </div>

        <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-x-9 gap-y-8 text-center sm:max-w-none sm:grid-cols-3 md:mx-0 md:text-left">
          <nav aria-label="Portal sections">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-faint uppercase">Portal</p>
            <ul className="mt-3 flex flex-col gap-2 text-[13px]">
              <li><Link to="/" className="text-text-secondary transition-colors hover:text-navy hover:underline">Home</Link></li>
              <li><Link to="/?view=projects" className="text-text-secondary transition-colors hover:text-navy hover:underline">Projects</Link></li>
              <li><Link to="/?view=announcements" className="text-text-secondary transition-colors hover:text-navy hover:underline">Announcements</Link></li>
              <li><Link to="/?view=officials" className="text-text-secondary transition-colors hover:text-navy hover:underline">Officials</Link></li>
              <li><Link to="/?view=about" className="text-text-secondary transition-colors hover:text-navy hover:underline">About</Link></li>
            </ul>
          </nav>
          <nav aria-label="Procurement law and help">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-faint uppercase">Law & help</p>
            <ul className="mt-3 flex flex-col gap-2 text-[13px]">
              <li><Link to="/?view=about" className="text-text-secondary transition-colors hover:text-navy hover:underline">What is published and why</Link></li>
              <li><Link to="/?view=about#bidder" className="text-text-secondary transition-colors hover:text-navy hover:underline">How to become a bidder</Link></li>
              <li><Link to="/?view=about#contact" className="text-text-secondary transition-colors hover:text-navy hover:underline">Report an error</Link></li>
              <li>
                <a
                  href="https://www.gppb.gov.ph"
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-secondary transition-colors hover:text-navy hover:underline"
                >
                  GPPB / RA 12009 resources
                </a>
              </li>
            </ul>
          </nav>
          <div className="col-span-2 mx-auto max-w-[15rem] sm:col-span-1 sm:mx-0">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-faint uppercase">Account</p>
            <ul className="mt-3 flex flex-col gap-2 text-[13px]">
              <li><Link to="/login" className="text-text-secondary transition-colors hover:text-navy hover:underline">Sign in for officials & bidders</Link></li>
              <li><span className="text-[12px] leading-relaxed text-text-faint">Browsing these records needs no account.</span></li>
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
