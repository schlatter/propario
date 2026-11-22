import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { PICTURE_VIEWS, type Crop, type PictureView, type Product } from '../../db/types'
import { formFromProfiles, profileSteps } from '../../domain/form'
import { viewsOf } from '../../domain/pictures'
import type { Size } from '../../domain/size'
import { useI18n } from '../../i18n'
import { setDrawing, setPictureView } from '../../images'
import { Modal } from '../../ui/Dialog'
import { looksDrawn, readDrawing, readRows, useMeasured } from './useMeasured'

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

/** What a picture is for 3D and the sizes to scale: a dimension drawing, one side of the product, or neither. */
type Kind = 'drawing' | PictureView | null
type Frame = 'front' | 'side'

/**
 * Says what a picture shows, for 3D and the sizes to scale. A dimension drawing gives the form
 * and the product's lines: its front and side view are found in it (src/domain/drawing.ts), and
 * the form is read from them. A photo or drawing of one side fills that side. Every part can be
 * set by hand: drag a frame, or tap two corners one after the other; with the keyboard the arrow
 * keys move it and, with Shift, change its size.
 */
export function PictureViewDialog({ product, src, size, onClose }: { product: Product; src: string; size?: Size; onClose: () => void }) {
  const { m } = useI18n()
  const marked = viewsOf(product.views, src)
  const isDrawing = product.drawing?.src === src
  /** This picture's own part for a side, when it is marked as it. */
  const cropFor = (v: Kind) => (v && v !== 'drawing' && product.views?.[v]?.src === src ? product.views[v]!.crop : null)
  const [kind, setKindState] = useState<Kind>(isDrawing ? 'drawing' : (marked[0] ?? 'front'))
  const touched = useRef(isDrawing || marked.length > 0)
  /** One side: its part, null while found automatically. */
  const [crop, setCrop] = useState<Crop | null>(cropFor(kind))
  /** A drawing: where its front and side view are, and which of the two frames is being set. */
  const [parts, setParts] = useState<{ front: Crop | null; side: Crop | null }>(
    isDrawing ? { front: product.drawing!.front, side: product.drawing!.side } : { front: null, side: null },
  )
  const [frame, setFrame] = useState<Frame>('front')
  const [found, setFound] = useState(isDrawing)
  /** The first of two tapped corners. */
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const auto = useMeasured(src)

  const find = async () => {
    const v = await readDrawing(src)
    setParts(v)
    setFrame(v.front || !v.side ? 'front' : 'side')
    setFound(true)
  }
  // A picture nobody has set yet that looks like a drawing: offer it as one, with its views found.
  useEffect(() => {
    if (touched.current) return
    void looksDrawn(src).then((drawn) => {
      if (!drawn || touched.current) return
      setKindState('drawing')
      void find()
    })
  }, [])
  const setKind = (k: Kind) => {
    touched.current = true
    setKindState(k)
    setCrop(cropFor(k))
    setCorner(null)
    if (k === 'drawing' && !found) void find()
  }

  /** The frame being set and how to change it. */
  const active: Crop | null = kind === 'drawing' ? parts[frame] : (crop ?? auto?.crop ?? WHOLE)
  const setActive = (c: Crop) => (kind === 'drawing' ? setParts((p) => ({ ...p, [frame]: c })) : setCrop(c))

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
    setActive(between(d, p))
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
      if (c.w > 0.02 && c.h > 0.02) setActive(c)
      setCorner(null)
    }
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.altKey ? 0.002 : 0.01
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault()
    const c = { ...(active ?? WHOLE) }
    if (e.shiftKey) {
      c.w = Math.max(0.02, Math.min(1 - c.x, c.w + d[0]))
      c.h = Math.max(0.02, Math.min(1 - c.y, c.h + d[1]))
    } else {
      c.x = clamp(Math.min(1 - c.w, c.x + d[0]))
      c.y = clamp(Math.min(1 - c.h, c.y + d[1]))
    }
    setActive(c)
  }
  const pct = (n: number) => `${Math.round(n * 100)} %`

  const save = async () => {
    if (kind === 'drawing') {
      const drawing = { src, front: parts.front && round(parts.front), side: parts.side && round(parts.side) }
      // The form comes from the side view at once – unless one was set already.
      let shape
      const full = size?.width && size.height && size.depth ? (size as Required<Size>) : null
      if (full && drawing.side && !product.shape?.length) {
        const rows = await readRows(src, drawing.side)
        const frontRows = drawing.front ? await readRows(src, drawing.front) : null
        const form = rows ? formFromProfiles(full, profileSteps(rows), frontRows ?? undefined) : []
        if (form.length) shape = form
      }
      await setDrawing(product, drawing, shape)
    } else {
      if (isDrawing) await setDrawing(product, null)
      await setPictureView(product, src, kind, kind && crop ? round(crop) : null)
    }
    onClose()
  }

  const frameStyle = (c: Crop) => ({ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` })
  const status = corner
    ? m.pictureView.secondCorner
    : kind === 'drawing'
      ? !found
        ? m.pictureView.finding
        : parts[frame]
          ? m.pictureView.frameSet(m.pictureView.frames[frame])
          : m.pictureView.frameMissing(m.pictureView.frames[frame])
      : crop
        ? m.pictureView.drawn
        : m.pictureView.automatic

  return (
    <Modal open onClose={onClose} labelledBy="pview-title" className="pview-modal">
      <div className="dialog pview">
        <h2 id="pview-title">{m.pictureView.title}</h2>
        <div className="seg" role="group" aria-label={m.pictureView.which}>
          <button type="button" aria-pressed={kind === 'drawing'} onClick={() => setKind('drawing')}>
            {m.pictureView.drawing}
          </button>
          {PICTURE_VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}>
              {m.pictureView.views[v]}
            </button>
          ))}
          <button type="button" aria-pressed={kind === null} onClick={() => setKind(null)}>
            {m.pictureView.none}
          </button>
        </div>
        {kind && (
          <>
            <p className="muted small">{kind === 'drawing' ? m.pictureView.hintDrawing : m.pictureView.hint}</p>
            {kind === 'drawing' && (
              <div className="seg" role="group" aria-label={m.pictureView.frameWhich}>
                {(['front', 'side'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={frame === f} onClick={() => (setFrame(f), setCorner(null))}>
                    {m.pictureView.frames[f]}
                  </button>
                ))}
              </div>
            )}
            <div
              className="pview-pic"
              // As wide as the picture's own shape allows in the space: the frame's shares then
              // match the picture exactly (also drawings without a size of their own).
              style={auto ? { aspectRatio: `${auto.nw} / ${auto.nh}`, width: `min(100%, calc(var(--pview-h) * ${auto.nw / auto.nh}))` } : undefined}
              tabIndex={0}
              role="group"
              aria-roledescription={m.pictureView.area}
              aria-label={
                active
                  ? m.pictureView.areaLabel(pct(active.x), pct(active.y), pct(active.w), pct(active.h))
                  : m.pictureView.frameMissing(m.pictureView.frames[frame])
              }
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKey}
            >
              <img src={src} alt="" draggable={false} />
              {kind === 'drawing' ? (
                (['front', 'side'] as const).map(
                  (f) =>
                    parts[f] && (
                      <span key={f} className={`pview-frame${f === frame ? '' : ' other'}`} style={frameStyle(parts[f]!)} aria-hidden="true">
                        <span className="pview-frame-label">{m.pictureView.frames[f]}</span>
                      </span>
                    ),
                )
              ) : (
                <span className={`pview-frame${crop ? '' : ' auto'}`} style={frameStyle(active!)} aria-hidden="true" />
              )}
              {corner && <span className="pview-corner" style={{ left: `${corner.x * 100}%`, top: `${corner.y * 100}%` }} aria-hidden="true" />}
            </div>
            <div className="row pview-tools">
              <span className="muted small" aria-live="polite">
                {status}
              </span>
              <span className="spacer" />
              {kind === 'drawing' ? (
                <button type="button" className="btn sm" onClick={() => void find()}>
                  {m.pictureView.auto}
                </button>
              ) : (
                <>
                  <button type="button" className="btn sm" onClick={() => setCrop(null)} disabled={!crop}>
                    {m.pictureView.auto}
                  </button>
                  <button type="button" className="btn sm" onClick={() => setCrop(WHOLE)}>
                    {m.pictureView.whole}
                  </button>
                </>
              )}
            </div>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {m.common.cancel}
          </button>
          <button type="button" className="btn primary" onClick={() => void save()} disabled={kind === 'drawing' && !parts.front && !parts.side}>
            {m.common.save}
          </button>
        </div>
      </div>
    </Modal>
  )
}
