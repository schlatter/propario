import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/** Small disclosure menu. Closes on outside click, Escape and after an action. */
export function Menu({
  label,
  trigger,
  children,
  className = 'icon-btn',
  listClassName = '',
  scroll,
}: {
  label: string
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  className?: string
  listClassName?: string
  scroll?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button
        ref={btn}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu-list${scroll ? ' scroll' : ''}${listClassName ? ` ${listClassName}` : ''}`} id={id} onClick={(e) => e.stopPropagation()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
