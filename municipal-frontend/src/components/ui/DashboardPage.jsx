// Page canvas and vertical rhythm. Tighter gutters than before, so tables get
// the horizontal room back.
export default function DashboardPage({ children }) {
  return <div className="flex min-h-full flex-col gap-4 bg-canvas p-4">{children}</div>
}
