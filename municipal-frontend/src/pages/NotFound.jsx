import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center text-navy">
      <p className="text-sm text-text-secondary">Page not found · 404</p>
      <h1 className="text-2xl font-semibold">This page is not available</h1>
      <p className="max-w-md text-sm text-text-secondary">Check the address or return to the transparency portal.</p>
      <Link to="/" className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-accent-fg">Open transparency portal</Link>
    </main>
  )
}
