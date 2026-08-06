import { useMemo } from 'react'
import { useAuth } from './useAuth'

// Convenience wrapper over the permission list the server sends with the
// session user. Presentation only — the API enforces permissions independently.
//
// ── WHY THIS IS MEMOISED ─────────────────────────────────────────────────────
// It used to build a fresh Set and a fresh object on every render, which made
// the returned value a new identity every time. Anything that put it in a
// dependency array therefore saw it change on every render — and the role
// dashboard did exactly that:
//
//   useEffect(() => { ...fetch...; setState(...) }, [permissions])
//
// setState re-rendered, the re-render produced a new `permissions` object, the
// effect re-ran, and it fetched again. Every role's dashboard was re-fetching
// its data in a loop for as long as it was open.
//
// The permission list is a flat array of strings that only changes when the
// session does, so keying the memo on its joined contents is both stable and
// correct: sign in as someone else and the identity changes exactly once.
export function usePermissions() {
  const { user } = useAuth()
  const key = (user?.permissions ?? []).join(',')

  return useMemo(() => {
    const held = new Set(key ? key.split(',') : [])
    return {
      has: (permission) => held.has(permission),
      hasAny: (...permissions) => permissions.some((permission) => held.has(permission)),
      all: held,
    }
    // `key` is the whole permission list; `user.permissions` itself is a new
    // array identity on each render and would defeat the memo.
  }, [key])
}
