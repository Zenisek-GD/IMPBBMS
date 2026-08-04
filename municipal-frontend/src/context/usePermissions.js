import { useAuth } from './useAuth'

// Convenience wrapper over the permission list the server sends with the
// session user. Presentation only — the API enforces permissions independently.
export function usePermissions() {
  const { user } = useAuth()
  const held = new Set(user?.permissions ?? [])

  return {
    has: (permission) => held.has(permission),
    hasAny: (...permissions) => permissions.some((permission) => held.has(permission)),
    all: held,
  }
}
