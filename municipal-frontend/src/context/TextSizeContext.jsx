import { useCallback, useEffect, useMemo, useState } from 'react'
import { updatePreferences } from '../api/auth'
import { useAuth } from './useAuth'
import { TextSizeContext } from './text-size-context'

const SIZES = ['normal', 'large', 'extraLarge']
const STORAGE_PREFIX = 'procurenance.text-size.'

const readStored = (key) => {
  try {
    const value = window.localStorage.getItem(key)
    return SIZES.includes(value) ? value : null
  } catch {
    return null
  }
}

const writeStored = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Browser storage is an optional first-paint cache, not a requirement.
  }
}

export function TextSizeProvider({ children }) {
  const { user, setUser } = useAuth()
  const storageKey = `${STORAGE_PREFIX}${user?.id ?? 'public'}`
  const [override, setOverride] = useState(null)
  const preference = override?.key === storageKey
    ? override.value
    : (user?.textSizePreference ?? readStored(storageKey) ?? 'normal')

  useEffect(() => {
    document.documentElement.dataset.textSize = preference
    writeStored(storageKey, preference)
  }, [preference, storageKey])

  const setPreference = useCallback((next) => {
    if (!SIZES.includes(next)) return
    setOverride({ key: storageKey, value: next })
    writeStored(storageKey, next)
    if (!user) return
    updatePreferences({ textSizePreference: next })
      .then((saved) => setUser((current) => ({ ...current, textSizePreference: saved.textSizePreference })))
      .catch(() => {
        // Keep this device's selection even if a temporary network outage
        // prevents persistence; the next successful preference change repairs it.
      })
  }, [setUser, storageKey, user])

  const value = useMemo(() => ({ preference, setPreference, sizes: SIZES }), [preference, setPreference])
  return <TextSizeContext.Provider value={value}>{children}</TextSizeContext.Provider>
}
