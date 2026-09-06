import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center text-navy">
          <h1 className="text-2xl font-semibold">The page could not be displayed</h1>
          <p className="max-w-md text-sm text-text-secondary">Please reload the page. Unsaved changes may be lost. If this continues, contact your system administrator.</p>
          <button type="button" className="rounded-md bg-accent px-5 py-3 text-accent-fg" onClick={() => window.location.reload()}>Reload page</button>
          <a href="/" className="text-sm underline">Open transparency portal</a>
        </main>
      )
    }
    return this.props.children
  }
}
