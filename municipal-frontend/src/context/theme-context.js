import { createContext } from 'react'

export const ThemeContext = createContext({
  preference: 'system',
  resolved: 'light',
  setPreference: () => {},
  toggle: () => {},
})
