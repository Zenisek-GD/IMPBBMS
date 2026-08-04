import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import DashboardPage from '../../components/ui/DashboardPage'
import PageHeader from '../../components/ui/PageHeader'
import TransparencyBrowser from '../../components/transparency/TransparencyBrowser'

// The signed-in view of the portal. It reads the same public endpoints as the
// citizen-facing page at /public/transparency — this page adds the app chrome
// and nothing else.
export default function TransparencyPortal() {
  return (
    <DashboardPage>
      <TransparencyBrowser
        renderHeader={(overview) => (
          <PageHeader
            title="Transparency Portal"
            subtitle={
              overview ? `Published procurement records — ${overview.lgu.name}` : 'Published records'
            }
            actions={
              <Link
                to="/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-sm border border-border-muted px-4 py-2 text-[11px] font-medium tracking-[0.03em] text-navy"
              >
                <ExternalLink size={13} /> PUBLIC VIEW
              </Link>
            }
          />
        )}
      />
    </DashboardPage>
  )
}
