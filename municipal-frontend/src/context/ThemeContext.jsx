import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './theme-context'
import { useAuth } from './useAuth'
import { updatePreferences } from '../api/auth'

// ── THEME, PER ACCOUNT ───────────────────────────────────────────────────────
// The setting belongs to the signed-in user, not to the browser. If the Mayor
// switches to dark, nobody else's view changes — including someone signing in
// on the same machine a minute later.
//
// Persistence is two-layer, and both layers are needed:
//
//   server  the source of truth. Follows the account across devices, and is
//           what makes the setting genuinely per-user rather than per-browser.
//   local   a cache keyed by user id, read synchronously on boot. Without it
//           the page paints in the default theme and then snaps to the user's
//           once /auth/me resolves, which is a visible flash on every load.

const STORAGE_PREFIX = 'procurenance.theme.'
const ANONYMOUS_KEY = `${STORAGE_PREFIX}public`

const readStored = (key) => {
  try {
    const value = window.localStorage.getItem(key)
    return ['light', 'dark', 'system'].includes(value) ? value : null
  } catch {
    // Private browsing and blocked storage both throw here. A missing cache
    // only costs a flash, so it is never worth failing over.
    return null
  }
}

const writeStored = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* not fatal — see above */
  }
}

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches

export function ThemeProvider({ children }) {
  const { user } = useAuth()

  // Anonymous visitors on the public portal get a theme too; theirs is
  // browser-local, since there is no account to attach it to.
  const storageKey = user ? `${STORAGE_PREFIX}${user.id}` : ANONYMOUS_KEY

  // The user's own choice this session, tagged with who made it. Tagging is
  // what keeps the setting private: when the account changes, the storage key
  // changes, this override stops matching, and the new user falls through to
  // their own stored preference rather than inheriting the last person's.
  const [override, setOverride] = useState(null)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Derived, not synced. Resolving the preference during render — rather than
  // writing it into state from an effect — means the first paint is already
  // correct. Copying it into state would render the wrong theme once, then
  // correct it, which is exactly the flash the local cache exists to avoid.
  //
  // Precedence: this session's choice → the account's saved setting → whatever
  // this browser last cached for them → light.
  //
  // The fallback is LIGHT, not 'system'. Following the OS meant anyone whose
  // machine is set to dark — which is most phones by default — opened a municipal
  // records portal in dark mode without ever asking for it. This is a government
  // publication first: light is its default appearance, and dark is available to
  // whoever explicitly picks it. Choosing 'system' is still supported and still
  // honoured; it is simply no longer assumed.
  const preference =
    override?.key === storageKey
      ? override.value
      : (user?.themePreference ?? readStored(storageKey) ?? 'light')

  // Track the OS setting so "system" stays live rather than being sampled once.
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = (event) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  // Writing to the DOM and to localStorage is what effects are actually for —
  // both are external systems being kept in step with React state, rather than
  // React state being derived from itself.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.dataset.theme = resolved
  }, [resolved])

  // Refresh the boot cache so the next load paints this user's theme on the
  // first frame, before /auth/me has even been answered.
  useEffect(() => {
    writeStored(storageKey, preference)
  }, [storageKey, preference])

  const setPreference = useCallback(
    (next) => {
      setOverride({ key: storageKey, value: next })
      writeStored(storageKey, next)

      // Fire-and-forget. The UI has already changed; a failed write means the
      // choice does not follow them to another device, which is not worth
      // interrupting them over.
      if (user) updatePreferences({ themePreference: next }).catch(() => {})
    },
    [storageKey, user]
  )

  // Toggling from "system" commits to the opposite of whatever is on screen,
  // which is what someone clicking a light/dark switch expects.
  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark')
  }, [resolved, setPreference])

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
