// Shared footer for the public portal. The disclosure about what is and is not
// published belongs on every public page, not just the index — a citizen who
// lands directly on a project deserves the same statement of scope.
export default function PublicFooter() {
  return (
    <footer className="mt-8 border-t border-border-muted bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <p className="max-w-4xl text-xs leading-relaxed text-text-faint">
          Published under the Implementing Rules and Regulations of RA No. 12009 (New Government Procurement
          Act). These pages show approved and published records only. Drafts, internal deliberations, evaluator
          identities and individual bid scores are not published — blind evaluation depends on the scorer
          remaining unidentified. Figures are as recorded by the Bids and Awards Committee. For records not
          shown here, file a request with the BAC Secretariat.
        </p>
      </div>
    </footer>
  )
}
