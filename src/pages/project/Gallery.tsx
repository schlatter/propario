/**
 * A product's pictures, large: opens at a chosen picture, steps with ‹ ›, the arrow keys, a swipe
 * or the thumbnails; a tap on the picture shows it at full size (also how a phone zooms in). The
 * first picture is the main one, marked with a star; the star makes another picture the main one,
 * which then moves to the front – as in classified-ad apps.
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { useI18n } from '../../i18n'

export function Gallery({
  pictures,
  name,
  start,
  open,
  onClose,
  onMakeMain,
}: {
  pictures: string[]
  name: string
  start: number
  open: boolean
  onClose: () => void
  /** Makes picture `i` the main one (moves it to the front); absent when one may not edit. */
  onMakeMain?: (i: number) => void
}) {
  const { m } = useI18n()
  const [index, setIndex] = useState(start)
  const [zoomed, setZoomed] = useState(false)
  useEffect(() => {
    if (open) {
      setIndex(start)
      setZoomed(false)
    }
  }, [open, start])
  const count = pictures.length
  const at = Math.min(index, count - 1)
  const go = (delta: number) => {
    if (count < 2) return
    setIndex((i) => (i + delta + count) % count)
    setZoomed(false)
  }

  // ← → step through the pictures while the gallery is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      e.stopPropagation()
      go(e.key === 'ArrowLeft' ? -1 : 1)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  })

  // A swipe steps too – unless the picture is zoomed in, then the finger moves the picture.
  const touch = useRef<{ x: number; y: number } | null>(null)

  if (!count) return null
  const isMain = at === 0
  return (
    <Modal open={open} onClose={onClose} className="gallery" labelledBy="gallery-title">
      <div
        className="gallery-inner"
        onTouchStart={(e) => (touch.current = e.touches.length === 1 && !zoomed ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null)}
        onTouchEnd={(e) => {
          const s = touch.current
          touch.current = null
          if (!s) return
          const dx = e.changedTouches[0].clientX - s.x
          const dy = e.changedTouches[0].clientY - s.y
          if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1)
        }}
      >
        <div className="gallery-head">
          <h2 id="gallery-title" className="gallery-title">
            {name}
          </h2>
          <span className="gallery-count" aria-live="polite">
            {m.gallery.position(at + 1, count)}
          </span>
          {onMakeMain && (
            <button
              type="button"
              className={`btn sm gallery-star${isMain ? ' is-main' : ''}`}
              aria-pressed={isMain}
              disabled={isMain}
              onClick={() => {
                onMakeMain(at)
                setIndex(0)
              }}
            >
              <Glyph name="star" /> {isMain ? m.gallery.isMain : m.gallery.makeMain}
            </button>
          )}
          <button type="button" className="icon-btn" onClick={onClose} aria-label={m.common.close} title={m.common.close}>
            <Glyph name="close" />
          </button>
        </div>
        <div className={`gallery-stage${zoomed ? ' zoomed' : ''}`}>
          {count > 1 && (
            <button type="button" className="gallery-nav prev" onClick={() => go(-1)} aria-label={m.gallery.prev} title={`${m.gallery.prev} (←)`}>
              <Glyph name="chevronLeft" />
            </button>
          )}
          <button type="button" className="gallery-picture" onClick={() => setZoomed(!zoomed)} aria-label={zoomed ? m.gallery.fit : m.gallery.zoom}>
            <img src={pictures[at]} alt={m.gallery.alt(name, at + 1, count)} referrerPolicy="no-referrer" draggable={false} />
          </button>
          {count > 1 && (
            <button type="button" className="gallery-nav next" onClick={() => go(1)} aria-label={m.gallery.next} title={`${m.gallery.next} (→)`}>
              <Glyph name="chevronRight" />
            </button>
          )}
        </div>
        {count > 1 && (
          <div className="gallery-strip" role="group" aria-label={m.gallery.all}>
            {pictures.map((src, i) => (
              <button
                key={src}
                type="button"
                className={`gallery-thumb${i === at ? ' current' : ''}`}
                aria-current={i === at}
                aria-label={m.gallery.alt(name, i + 1, count) + (i === 0 ? ` – ${m.gallery.isMain}` : '')}
                onClick={() => {
                  setIndex(i)
                  setZoomed(false)
                }}
              >
                <img src={src} alt="" referrerPolicy="no-referrer" draggable={false} />
                {i === 0 && (
                  <span className="gallery-main-mark" aria-hidden="true">
                    <Glyph name="star" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
