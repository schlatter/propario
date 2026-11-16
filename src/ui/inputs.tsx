import { useEffect, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/**
 * Text input that keeps its own draft and commits on blur or Enter.
 * Escape restores the stored value. Avoids a database write per keystroke.
 */
export function CommitInput({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (draft !== value) onCommit(draft)
        rest.onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(value)
          e.stopPropagation()
        }
        rest.onKeyDown?.(e)
      }}
    />
  )
}

export function CommitTextarea({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <textarea
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setDraft(value)
          e.stopPropagation()
        }
      }}
    />
  )
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`field${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}
