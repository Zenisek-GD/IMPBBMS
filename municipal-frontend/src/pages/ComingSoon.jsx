import { useAuth } from '../context/useAuth'

// Landing page for every role whose real dashboard hasn't been built yet
// (see src/config/roleLanding.js). Not wrapped in AppShell since there's no
// real nav config for these roles until their Figma screens are pulled.
export default function ComingSoon() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f9f9fe] px-6 text-center">
      <span className="text-lg font-bold text-navy">CivicBid</span>
      <h1 className="text-lg font-semibold text-navy">
        {user?.roleName ? `${user.roleName} workspace` : 'Your workspace'} is being built
      </h1>
      <p className="max-w-md text-sm text-text-secondary">
        You're signed in as {user?.name}. This role's screens haven't been implemented yet — check back soon.
      </p>
      <button
        type="button"
        onClick={logout}
        className="mt-2 rounded-sm border border-border-muted px-4 py-2 text-xs font-medium tracking-[0.02em] text-navy"
      >
        LOG OUT
      </button>
    </div>
  )
}
