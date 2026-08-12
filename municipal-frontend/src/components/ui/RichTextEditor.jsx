import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Table as TableIcon, Image as ImageIcon,
  Undo2, Redo2, RemoveFormatting, Heading1, Heading2, Minus,
} from 'lucide-react'

// ── A DELIBERATELY SMALL EDITOR ──────────────────────────────────────────────
// Built on contenteditable rather than pulling in TipTap or Quill, for one
// reason that outweighs the convenience: this markup is rendered into PDFs on
// the server and published on the public portal, so what it is *allowed to
// produce* is a security question. A library produces whatever its schema
// permits; this produces a small set of tags the server's sanitiser already
// accepts, so the editor and the filter agree by construction.
//
// `document.execCommand` is formally deprecated and has no replacement for
// this job. It remains implemented in every current browser, and the fallback
// if it ever goes is that formatting buttons stop working while typing still
// does — an acceptable failure for an internal tool.

const FONT_SIZES = [
  { label: 'Small', value: '10pt' },
  { label: 'Normal', value: '12pt' },
  { label: 'Large', value: '14pt' },
  { label: 'Heading', value: '18pt' },
  { label: 'Title', value: '24pt' },
]

const FONT_FAMILIES = [
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Courier', value: "'Courier New', monospace" },
]

function ToolbarButton({ icon: Icon, label, onClick, active }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Mousedown rather than click, and prevented: clicking a toolbar button
      // would otherwise blur the editable area and collapse the selection the
      // command is meant to act on.
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
        active ? 'bg-navy text-white' : 'text-text-secondary hover:bg-chip hover:text-navy'
      }`}
    >
      <Icon size={14} />
    </button>
  )
}

export default function RichTextEditor({ value, onChange, minHeight = '420px', ariaLabel = 'Document body' }) {
  const editorRef = useRef(null)
  const [imageError, setImageError] = useState('')

  // The editable div is uncontrolled: writing `value` back into it on every
  // keystroke would reset the caret to the start of the document. It is seeded
  // once, and thereafter only overwritten when the incoming value genuinely
  // differs from what the DOM already holds (loading a different template).
  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === undefined])

  useEffect(() => {
    const el = editorRef.current
    if (el && (value ?? '') !== el.innerHTML && document.activeElement !== el) {
      el.innerHTML = value ?? ''
    }
  }, [value])

  const emit = useCallback(() => {
    onChange?.(editorRef.current?.innerHTML ?? '')
  }, [onChange])

  const exec = useCallback(
    (command, argument = null) => {
      editorRef.current?.focus()
      document.execCommand(command, false, argument)
      emit()
    },
    [emit]
  )

  const insertHtml = useCallback(
    (html) => {
      editorRef.current?.focus()
      document.execCommand('insertHTML', false, html)
      emit()
    },
    [emit]
  )

  // Exposed so a parent can drop a placeholder token in at the caret.
  useEffect(() => {
    const el = editorRef.current
    if (el) el.__insertAtCaret = insertHtml
  }, [insertHtml])

  const addImage = (file) => {
    setImageError('')
    // Images are embedded as data URIs because the server refuses any remote
    // src — a document that fetched its own logo from the internet would leak
    // every reader to a third party and break the moment the host moved.
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      setImageError('Use a PNG, JPEG, GIF or WEBP. SVG is not accepted.')
      return
    }
    if (file.size > 1024 * 1024) {
      setImageError('Keep logos under 1MB — the image is embedded in every document generated.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => insertHtml(`<img src="${reader.result}" alt="" style="max-width:180px" />`)
    reader.readAsDataURL(file)
  }

  const insertTable = () => {
    const rows = Number(window.prompt('Rows?', '3'))
    const cols = Number(window.prompt('Columns?', '3'))
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return

    const body = Array.from({ length: rows })
      .map(
        () =>
          `<tr>${Array.from({ length: cols })
            .map(() => '<td style="border:1px solid #000; padding:4pt">&nbsp;</td>')
            .join('')}</tr>`
      )
      .join('')
    insertHtml(`<table class="doc-table" style="width:100%">${body}</table><p><br></p>`)
  }

  const selectClass =
    'rounded border border-border-muted bg-surface px-1.5 py-1 text-[11px] text-navy focus:border-navy focus:outline-none'

  return (
    <div className="rounded border border-border-muted">
      <div className="flex flex-wrap items-center gap-1 border-b border-border-muted bg-sidebar px-2 py-1.5">
        <ToolbarButton icon={Bold} label="Bold" onClick={() => exec('bold')} />
        <ToolbarButton icon={Italic} label="Italic" onClick={() => exec('italic')} />
        <ToolbarButton icon={Underline} label="Underline" onClick={() => exec('underline')} />
        <ToolbarButton icon={Strikethrough} label="Strikethrough" onClick={() => exec('strikeThrough')} />

        <span className="mx-1 h-4 w-px bg-border-muted" />

        <ToolbarButton icon={Heading1} label="Heading 1" onClick={() => exec('formatBlock', '<h1>')} />
        <ToolbarButton icon={Heading2} label="Heading 2" onClick={() => exec('formatBlock', '<h2>')} />

        <span className="mx-1 h-4 w-px bg-border-muted" />

        <ToolbarButton icon={AlignLeft} label="Align left" onClick={() => exec('justifyLeft')} />
        <ToolbarButton icon={AlignCenter} label="Centre" onClick={() => exec('justifyCenter')} />
        <ToolbarButton icon={AlignRight} label="Align right" onClick={() => exec('justifyRight')} />
        <ToolbarButton icon={AlignJustify} label="Justify" onClick={() => exec('justifyFull')} />

        <span className="mx-1 h-4 w-px bg-border-muted" />

        <ToolbarButton icon={List} label="Bulleted list" onClick={() => exec('insertUnorderedList')} />
        <ToolbarButton icon={ListOrdered} label="Numbered list" onClick={() => exec('insertOrderedList')} />
        <ToolbarButton icon={TableIcon} label="Insert table" onClick={insertTable} />
        <ToolbarButton icon={Minus} label="Horizontal rule" onClick={() => exec('insertHorizontalRule')} />

        <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-secondary hover:bg-chip hover:text-navy" title="Insert image">
          <ImageIcon size={14} />
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) addImage(file)
              event.target.value = ''
            }}
          />
        </label>

        <span className="mx-1 h-4 w-px bg-border-muted" />

        <select
          className={selectClass}
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) exec('fontName', event.target.value)
            event.target.value = ''
          }}
        >
          <option value="">Font</option>
          {FONT_FAMILIES.map((font) => (
            <option key={font.value} value={font.value}>{font.label}</option>
          ))}
        </select>

        <select
          className={selectClass}
          defaultValue=""
          onChange={(event) => {
            // execCommand's fontSize only takes 1–7, which does not map onto
            // point sizes a document needs, so the size is applied as a style
            // on a wrapper around the selection instead.
            const size = event.target.value
            if (size) {
              const selection = window.getSelection()
              if (selection && !selection.isCollapsed) {
                insertHtml(`<span style="font-size:${size}">${selection.toString()}</span>`)
              }
            }
            event.target.value = ''
          }}
        >
          <option value="">Size</option>
          {FONT_SIZES.map((size) => (
            <option key={size.value} value={size.value}>{size.label}</option>
          ))}
        </select>

        <span className="mx-1 h-4 w-px bg-border-muted" />

        <ToolbarButton icon={RemoveFormatting} label="Clear formatting" onClick={() => exec('removeFormat')} />
        <ToolbarButton icon={Undo2} label="Undo" onClick={() => exec('undo')} />
        <ToolbarButton icon={Redo2} label="Redo" onClick={() => exec('redo')} />
      </div>

      {imageError && (
        <p role="alert" className="border-b border-border-muted bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {imageError}
        </p>
      )}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={emit}
        onBlur={emit}
        // Paste as plain text. Pasting from Word carries a payload of nested
        // spans, class names and occasionally script — all of which the server
        // would strip anyway, leaving the author wondering why their document
        // looks different after saving.
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
          emit()
        }}
        className="min-h-[320px] overflow-y-auto bg-surface px-6 py-5 text-[13px] leading-relaxed text-navy focus:outline-none"
        style={{ minHeight }}
      />
    </div>
  )
}
