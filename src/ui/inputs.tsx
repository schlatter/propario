import { cloneElement, type InputHTMLAttributes, isValidElement, type TextareaHTMLAttributes, useEffect, useId, useState } from 'react'

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

/**
 * A labelled control. `hint` says in a few words what belongs in it; it is shown under the
 * label and read out as the control's description.
 */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  const id = useId()
  const control = hint && isValidElement<{ 'aria-describedby'?: string }>(children) ? cloneElement(children, { 'aria-describedby': id }) : children
  return (
    <label className={`field${className ? ` ${className}` : ''}`}>
      <span>{label}</span>
      {hint && (
        // Not part of the control's name (it sits inside the label), but its description.
        <small id={id} className="field-hint" aria-hidden="true">
          {hint}
        </small>
      )}
      {control}
    </label>
  )
}
