import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { PICTURE_VIEWS, type Crop, type PictureView, type Product } from '../../db/types'
import { viewsOf } from '../../domain/pictures'
import { useI18n } from '../../i18n'
import { setPictureView } from '../../images'
import { Modal } from '../../ui/Dialog'
import { useMeasured } from './useMeasured'

const WHOLE: Crop = { x: 0, y: 0, w: 1, h: 1 }
const clamp = (n: number) => Math.min(1, Math.max(0, n))
/** The box between two corners, as shares of the picture. */
const between = (a: { x: number; y: number }, b: { x: number; y: number }): Crop => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
})
const round = (c: Crop): Crop => {
  const r = (n: number) => Math.round(n * 1000) / 1000
  const x = r(c.x)
  const y = r(c.y)
  return { x, y, w: Math.min(r(c.w), 1 - x), h: Math.min(r(c.h), 1 - y) }
}

/**
 * Says which side of the product a picture shows – front, side or back – and which part of it
 * the product is, for the sizes to scale. The part is found by itself (white background left
 * out) or drawn: drag a frame, or tap two corners one after the other; with the keyboard the
 * arrow keys move it and, with Shift, change its size.
 */
export function PictureViewDialog({ product, src, onClose }: { product: Product; src: string; onClose: () => void }) {
  const { m } = useI18n()
  const marked = viewsOf(product.views, src)
  /** This picture's own part for a side, when it is marked as it. */
  const cropFor = (v: PictureView | null) => (v && product.views?.[v]?.src === src ? product.views[v]!.crop : null)
  // A picture not marked yet is most likely the front.
  const [view, setViewState] = useState<PictureView | null>(marked[0] ?? 'front')
  /** null: found automatically. */
  const [crop, setCrop] = useState<Crop | null>(cropFor(marked[0] ?? null))
  /** The first of two tapped corners. */
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  // Each side has its own part of the picture: switching shows that side's.
  const setView = (v: PictureView | null) => {
    setViewState(v)
    setCrop(cropFor(v))
    setCorner(null)
  }
  const auto = useMeasured(src)
  const shown = crop ?? auto?.crop ?? WHOLE

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { ...at(e), moved: false }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const p = at(e)
    if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 0.02) return
    d.moved = true
    setCorner(null)
    setCrop(between(d, p))
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved) return
    // A tap: the first sets a corner, the second the opposite one.
    const p = at(e)
    if (!corner) setCorner(p)
    else {
      const c = between(corner, p)
      if (c.w > 0.02 && c.h > 0.02) setCrop(c)
      setCorner(null)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.altKey ? 0.002 : 0.01
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault()
    const c = { ...shown }
    if (e.shiftKey) {
      c.w = Math.max(0.02, Math.min(1 - c.x, c.w + d[0]))
      c.h = Math.max(0.02, Math.min(1 - c.y, c.h + d[1]))
    } else {
      c.x = clamp(Math.min(1 - c.w, c.x + d[0]))
      c.y = clamp(Math.min(1 - c.h, c.y + d[1]))
    }
    setCrop(c)
  }
  const pct = (n: number) => `${Math.round(n * 100)} %`
  const save = async () => {
    await setPictureView(product, src, view, view && crop ? round(crop) : null)
    onClose()
  }

  return (
    <Modal open onClose={onClose} labelledBy="pview-title" className="pview-modal">
      <div className="dialog pview">
        <h2 id="pview-title">{m.pictureView.title}</h2>
        <div className="seg" role="group" aria-label={m.pictureView.which}>
          {PICTURE_VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {m.pictureView.views[v]}
            </button>
          ))}
          <button type="button" aria-pressed={view === null} onClick={() => setView(null)}>
            {m.pictureView.none}
          </button>
        </div>
        {view && (
          <>
            <p className="muted small">{m.pictureView.hint}</p>
            <div
              className="pview-pic"
              // As wide as the picture's own shape allows in the space: the frame's shares then
              // match the picture exactly (also drawings without a size of their own).
              style={auto ? { aspectRatio: `${auto.nw} / ${auto.nh}`, width: `min(100%, calc(var(--pview-h) * ${auto.nw / auto.nh}))` } : undefined}
              tabIndex={0}
              role="group"
              aria-roledescription={m.pictureView.area}
              aria-label={m.pictureView.areaLabel(pct(shown.x), pct(shown.y), pct(shown.w), pct(shown.h))}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKey}
            >
              <img src={src} alt="" draggable={false} />
              <span
                className={`pview-frame${crop ? '' : ' auto'}`}
                style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }}
                aria-hidden="true"
              />
              {corner && <span className="pview-corner" style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }} aria-hidden="true" />}
            </div>
            <div className="row pview-tools">
              <span className="muted small" aria-live="polite">
                {corner ? m.pictureView.secondCorner : crop ? m.pictureView.drawn : m.pictureView.automatic}
              </span>
              <span className="spacer" />
              <button type="button" className="btn sm" onClick={() => setCrop(null)} disabled={!crop}>
                {m.pictureView.auto}
              </button>
              <button type="button" className="btn sm" onClick={() => setCrop(WHOLE)}>
                {m.pictureView.whole}
              </button>
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {m.common.cancel}
          </button>
          <button type="button" className="btn primary" onClick={() => void save()}>
            {m.common.save}
          </button>
        </div>
      </div>
    </Modal>
  )
}
