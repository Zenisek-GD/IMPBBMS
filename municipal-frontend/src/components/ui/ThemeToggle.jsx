import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../context/useTheme'

// A single switch rather than a light/dark/system picker: three states is more
// than this needs, and "system" is still reachable — it is simply the default
// nobody has overridden yet.
//
// `tone="brand"` is for placement on the dark internal top bar and `tone="header"`
// for the green public header. Both stay dark/coloured in either theme, so they
// need their own foreground colours rather than the themed defaults.
export default function ThemeToggle({ tone = 'default', className = '' }) {
  const { resolved, toggle } = useTheme()
  const isDark = resolved === 'dark'

  const tones = {
    default:
      'border border-border-muted bg-surface text-text-secondary hover:text-navy hover:border-border-strong',
    brand: 'text-topnav-link hover:bg-white/10 hover:text-topnav-link-alt',
    header: 'text-header-muted hover:bg-white/15 hover:text-header-fg',
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // Announces what the control *does*, not what is currently on — a toggle
      // labelled with its present state reads backwards to a screen reader.
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      // Sized to match the notification bell beside it on the top bar. These two
      // sat at 15px and 20px, which read as a primary control and a lesser one.
      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${tones[tone]} ${className}`}
    >
      {isDark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  )
}
