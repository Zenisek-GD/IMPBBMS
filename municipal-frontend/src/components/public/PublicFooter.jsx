// Shared footer for the public portal. The disclosure about what is and is not
// published belongs on every public page, not just the index — a citizen who
// lands directly on a project deserves the same statement of scope.
//
// The footer text is configurable by the system administrator through System
// Settings → Branding, so a different deployment can adjust the disclosure to
// its own context. Falls back to the default RA 12009 disclosure.
import { Link } from 'react-router-dom'

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
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-8 md:grid-cols-4">
        <div>
          <p className="text-[14px] font-semibold text-navy">{systemName || 'ProcureNance'}</p>
          <p className="mt-1 text-[12.5px] text-navy">{portalName}</p>
          {lguAddress && <p className="mt-2 text-[12px] leading-relaxed text-navy">{lguAddress}</p>}
        </div>
        <nav aria-label="Portal sections">
          <p className="text-[11px] font-medium tracking-[0.06em] text-navy uppercase">Portal</p>
          <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px]">
            <li><Link to="/" className="text-navy hover:text-navy hover:underline">Home</Link></li>
            <li><Link to="/?view=projects" className="text-navy hover:text-navy hover:underline">Projects</Link></li>
            <li><Link to="/?view=announcements" className="text-navy hover:text-navy hover:underline">Announcements</Link></li>
            <li><Link to="/?view=officials" className="text-navy hover:text-navy hover:underline">Officials</Link></li>
            <li><Link to="/?view=about" className="text-navy hover:text-navy hover:underline">About</Link></li>
          </ul>
        </nav>
        <nav aria-label="Procurement law and help">
          <p className="text-[11px] font-medium tracking-[0.06em] text-navy uppercase">Law & help</p>
          <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px]">
            <li><Link to="/?view=about" className="text-navy hover:text-navy hover:underline">What is published and why</Link></li>
            <li><Link to="/?view=about#bidder" className="text-navy hover:text-navy hover:underline">How to become a bidder</Link></li>
            <li><Link to="/?view=about#contact" className="text-navy hover:text-navy hover:underline">Report an error</Link></li>
            <li>
              <a
                href="https://www.gppb.gov.ph"
                target="_blank"
                rel="noreferrer"
                className="text-navy hover:text-navy hover:underline"
              >
                GPPB / RA 12009 resources
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <p className="text-[11px] font-medium tracking-[0.06em] text-navy uppercase">Account</p>
          <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px]">
            <li><Link to="/login" className="text-navy hover:text-navy hover:underline">Sign in for officials & bidders</Link></li>
            <li><span className="text-[12px] text-navy">Browsing these records needs no account.</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border-muted">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8">
          <p className="max-w-4xl text-[12px] leading-relaxed text-navy">
            {transparencyFooter || DEFAULT_FOOTER}
          </p>
        </div>
      </div>
    </footer>
  )
}
