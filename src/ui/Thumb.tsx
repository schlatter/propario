import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const PREVIEW = 320

/**
 * Small product image that shows a large preview on hover or keyboard focus.
 * The preview is portalled to <body> so scrolling table containers cannot clip it.
 */
export function Thumb({ src, alt, onClick, label }: { src: string | null; alt: string; onClick?: () => void; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  if (!src) {
    return (
      <button type="button" className="thumb empty" onClick={onClick} aria-label={label} title={label}>
        <span aria-hidden="true" />
      </button>
    )
  }
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="thumb"
        onClick={onClick}
        aria-label={label}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />
      </button>
      {open && ref.current && <Preview anchor={ref.current} src={src} alt={alt} />}
    </>
  )
}

function Preview({ anchor, src, alt }: { anchor: HTMLElement; src: string; alt: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    const h = box.current?.offsetHeight ?? PREVIEW
    const w = box.current?.offsetWidth ?? PREVIEW
    // Prefer the right of the thumbnail, vertically centred on it; flip / clamp at the edges.
    let left = r.right + 12
    if (left + w > vw - 8) left = Math.max(8, r.left - 12 - w)
    const top = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), vh - h - 8)
    setPos({ left, top })
  }, [anchor])

  return createPortal(
    <div ref={box} className="thumb-preview" role="presentation" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
      <img src={src} alt={alt} referrerPolicy="no-referrer" />
      {alt && <span className="thumb-caption">{alt}</span>}
    </div>,
    document.body,
  )
}
