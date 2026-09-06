// Page canvas and vertical rhythm. The gutter is what separates a white card
// from the tinted page, so it has to be visible — at p-4 the cards were nearly
// touching the edges and the tint had nowhere to show.
export default function DashboardPage({ children }) {
  return <div className="flex min-h-full min-w-0 flex-col gap-5 bg-canvas p-4 sm:p-6">{children}</div>
}
