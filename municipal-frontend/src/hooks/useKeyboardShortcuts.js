import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Registers global keyboard shortcuts for sidebar navigation items.
//
// Each nav item can carry an optional `shortcut` string such as "Alt+1" or
// "Alt+Shift+A". The hook parses them into modifier+key tuples and binds a
// single `keydown` listener on `document` that navigates on match.
//
// Shortcuts are only active while no modal, dialog, or text input has focus,
// so they never fight with typing.

function parseShortcut(shortcutStr) {
  const parts = shortcutStr.split('+').map((p) => p.trim().toLowerCase())
  return {
    alt: parts.includes('alt'),
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    key: parts[parts.length - 1],
  }
}

function isTyping(e) {
  const tag = e.target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    e.target.isContentEditable ||
    e.target.closest('[role="dialog"]')
  )
}

export default function useKeyboardShortcuts(sections) {
  const navigate = useNavigate()

  useEffect(() => {
    // Flatten every section's items into a list of {href, parsed} tuples.
    const bindings = []
    for (const section of sections) {
      for (const item of section.items) {
        if (item.shortcut) {
          bindings.push({ href: item.href, parsed: parseShortcut(item.shortcut) })
        }
      }
    }

    if (bindings.length === 0) return

    function onKeyDown(e) {
      if (isTyping(e)) return

      for (const { href, parsed } of bindings) {
        const altMatch = parsed.alt === e.altKey
        const ctrlMatch = parsed.ctrl === e.ctrlKey
        const shiftMatch = parsed.shift === e.shiftKey
        const keyMatch = e.key.toLowerCase() === parsed.key

        if (altMatch && ctrlMatch && shiftMatch && keyMatch) {
          e.preventDefault()
          navigate(href)
          return
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sections, navigate])
}
