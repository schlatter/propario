import { useEffect, useRef, useState, type ReactNode } from 'react'

export type EditorKind = 'text' | 'longtext' | 'number' | 'date' | 'url' | 'select'

/**
 * Click (or Enter) to edit, Enter/Tab/blur to save, Escape to cancel.
 * Shows `display` when not editing.
 */
export function EditableCell({
  kind,
  value,
  display,
  onCommit,
  options,
  label,
  className = '',
  raw,
}: {
  kind: EditorKind
  value: string
  display?: ReactNode
  onCommit: (v: string) => void
  options?: string[]
  label: string
  className?: string
  raw?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>(null)
  const cancelled = useRef(false)

  useEffect(() => {
    if (editing) {
      ref.current?.focus()
      if (ref.current && 'select' in ref.current && kind !== 'select' && kind !== 'date') ref.current.select()
    }
  }, [editing, kind])

  const start = () => {
    setDraft(value)
    cancelled.current = false
    setEditing(true)
  }
  const finish = () => {
    setEditing(false)
    if (!cancelled.current && draft !== value) onCommit(draft)
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelled.current = true
      e.stopPropagation()
      ;(e.target as HTMLElement).blur()
    }
    if (e.key === 'Enter' && (kind !== 'longtext' || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      ;(e.target as HTMLElement).blur()
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`cell ${className}${raw ? ' raw' : ''}`}
        onClick={start}
        aria-label={`${label}: ${value || '—'}`}
        title={value || undefined}
      >
        {display ?? value}
      </button>
    )
  }
  const common = { ref, className: 'cell-editor', 'aria-label': label, onBlur: finish, onKeyDown: keys }
  if (kind === 'longtext') return <textarea {...common} value={draft} onChange={(e) => setDraft(e.target.value)} />
  if (kind === 'select')
    return (
      <select {...common} value={draft} onChange={(e) => setDraft(e.target.value)}>
        <option value="" />
        {[...new Set([...(options ?? []), ...(draft ? [draft] : [])])].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  return (
    <input
      {...common}
      type={kind === 'date' ? 'date' : kind === 'url' ? 'url' : 'text'}
      inputMode={kind === 'number' ? 'decimal' : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  )
}
