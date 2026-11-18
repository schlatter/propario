import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** Small disclosure menu. Closes on outside click, Escape and after an action. */
export function Menu({
  label,
  trigger,
  children,
  className = 'icon-btn',
  listClassName = '',
  scroll,
  floating,
}: {
  label: string
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  className?: string
  listClassName?: string
  scroll?: boolean
  /** Opens fixed to the viewport, for triggers inside containers that clip (table cells). */
  floating?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<CSSProperties | undefined>()
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
    // A floating list would drift away from its trigger when the page scrolls it away: close it
    // then – but not for a scroll that leaves the trigger where it was.
    const start = btn.current?.getBoundingClientRect()
    const onScroll = () => {
      if (!floating || !start || !btn.current) return
      const now = btn.current.getBoundingClientRect()
      if (Math.abs(now.top - start.top) > 2 || Math.abs(now.left - start.left) > 2) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, floating])
  useLayoutEffect(() => {
    if (!open || !floating || !btn.current) return setPlace(undefined)
    const r = btn.current.getBoundingClientRect()
    // Below the trigger, or above it when there is no room below.
    const below = window.innerHeight - r.bottom > 180
    setPlace({
      position: 'fixed',
      left: Math.max(8, r.left),
      right: 'auto',
      ...(below ? { top: r.bottom + 4 } : { top: 'auto', bottom: window.innerHeight - r.top + 4 }),
    })
  }, [open, floating])
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
        <div
          className={`menu-list${scroll ? ' scroll' : ''}${listClassName ? ` ${listClassName}` : ''}`}
          id={id}
          style={place}
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
