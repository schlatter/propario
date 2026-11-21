import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Product } from '../../db/types'
import { displayName } from '../../domain/display'
import {
  contentBox,
  fitsFront,
  scaleToFit,
  sizeFields,
  sizeLimits,
  sizeOf,
  VIEW_SIDES,
  viewsFor,
  type Crop,
  type Side,
  type Size,
  type View,
} from '../../domain/size'
import { useI18n } from '../../i18n'
import { productImage } from '../../images'
import type { ProjectData } from './useProjectData'

/** Height of the reference person, cm. */
const PERSON = 175
/** Space between figures, px. */
const GAP = 12
/** Least width of a column, so its caption stays readable, px. */
const MIN_COL = 64
/** Width of the reference person, cm. */
const PERSON_WIDTH = 45
/** Where the wall is drawn in the side view, px from the column's left edge. */
const WALL = 6

/**
 * The products to scale, side by side: from the front (width × height), the side (depth ×
 * height) or from above (width × depth, wall at the top). A person gives the scale; dashed lines
 * show the space the requirements leave, and what sticks out of it is hatched as not met. Only
 * the front can show the product's picture, and only when its shape matches the measurements.
 */
export function SizeCompare({ products, data }: { products: Product[]; data: ProjectData }) {
  const { m, fmt } = useI18n()
  const fields = useMemo(() => sizeFields(data.properties), [data.properties])
  const limits = useMemo(() => sizeLimits(data.rules, fields), [data.rules, fields])
  const [chosen, setChosen] = useState<View>('front')
  const [width, ref] = useWidth<HTMLDivElement>()

  const items = products.map((p) => ({ product: p, size: sizeOf(p, fields), name: p.model || displayName(p, m) }))
  const views = viewsFor(items.map((i) => i.size))
  if (!views.length) return null
  const view = views.includes(chosen) ? chosen : views[0]
  const [across, up] = VIEW_SIDES[view]
  const shown = items.filter((i) => i.size[across] && i.size[up])
  const missing = items.filter((i) => !shown.includes(i))
  const person = view !== 'top'
  const acrossMax = limits[across]?.max
  const upMax = limits[up]?.max

  // One scale in every view, set by the tallest thing standing (switching views keeps sizes) and
  // by the width: everything side by side without scrolling – unless that would make miniatures;
  // then the row scrolls sideways at a size that can still be read.
  const colCm = (s: Size) => Math.max(s[across]!, acrossMax ?? 0)
  const upCm = Math.max(...shown.map((i) => i.size[up]!), upMax ?? 0, person ? PERSON : 0) * 1.06
  const tallCm = Math.max(upCm, Math.max(...items.map((i) => i.size.height ?? 0), limits.height?.max ?? 0, PERSON) * 1.06)
  const cols = [...(person ? [PERSON_WIDTH] : []), ...shown.map((i) => colCm(i.size))]
  const fixed = GAP * (cols.length + 1) + (view === 'side' ? shown.length * (WALL + 4) : 0)
  const tall = width < 600 ? 250 : 330
  const cap = tall / tallCm
  const k = width > 0 ? (scaleToFit(cols, fixed, width, MIN_COL, cap, view === 'top' ? 1 : 0.4) ?? Math.min(cap, view === 'top' ? 1.2 : 0.9)) : 0
  const stage = Math.round(upCm * k)
  /** Distance from the floor (or, from above, the wall) in px from the top of a column. */
  const y = (cm: number) => (view === 'top' ? cm * k : stage - cm * k)

  const sideName = (s: Side) => fields[s]?.name ?? m.size.sides[s]
  const fmtCm = (n: number) => fmt.number(Math.round(n * 10) / 10)

  return (
    <details className="size-compare" open>
      <summary>
        <h2>{m.size.title}</h2>
      </summary>
      <div className="size-head">
        {views.length > 1 && (
          <div className="seg" role="group" aria-label={m.size.view}>
            {views.map((v) => (
              <button key={v} type="button" aria-pressed={v === view} onClick={() => setChosen(v)}>
                {m.size.views[v]}
              </button>
            ))}
          </div>
        )}
        <p className="muted small">
          {m.size.hint}
          {(acrossMax || upMax) && ` ${m.size.hintLimits}`}
        </p>
      </div>
      <div className="size-scroll" ref={ref}>
        {k > 0 && (
          <div className={`size-stage ${view}`} style={{ gap: GAP, paddingInline: GAP }}>
            <svg className="size-defs" aria-hidden="true" width="0" height="0">
              <defs>
                <pattern id="size-over" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" />
                </pattern>
              </defs>
            </svg>
            {person && (
              <figure className="size-col person">
                <Person k={k} height={stage} />
                <figcaption>
                  <span className="size-name">{m.size.person}</span>
                  <span className="size-dims">{fmt.number(PERSON / 100)} m</span>
                </figcaption>
              </figure>
            )}
            {shown.map(({ product, size, name }) => {
              const a = size[across]!
              const b = size[up]!
              const col = Math.max(colCm(size) * k + (view === 'side' ? WALL + 4 : 0), MIN_COL)
              const overA = acrossMax !== undefined && a > acrossMax
              const overB = upMax !== undefined && b > upMax
              return (
                <figure key={product.id} className={`size-col${product.candidate === 'excluded' ? ' is-excluded' : ''}`} style={{ width: col }}>
                  <Figure
                    view={view}
                    k={k}
                    col={col}
                    height={stage}
                    a={a}
                    b={b}
                    acrossMax={acrossMax}
                    upMax={upMax}
                    y={y}
                    picture={view === 'front' ? productImage(product) : null}
                  />
                  <figcaption>
                    <span className="size-name" title={name}>
                      {name}
                    </span>
                    <span className="size-dims">
                      <span className={overA ? 'over' : undefined}>{fmtCm(a)}</span> × <span className={overB ? 'over' : undefined}>{fmtCm(b)}</span> cm
                    </span>
                    <span className="sr-only">
                      {sideName(across)} {fmtCm(a)} cm{overA ? ` (${m.size.over})` : ''}, {sideName(up)} {fmtCm(b)} cm{overB ? ` (${m.size.over})` : ''}
                    </span>
                  </figcaption>
                </figure>
              )
            })}
            <div className="size-floor" style={{ top: y(0) }} aria-hidden="true" />
            {upMax !== undefined && (
              <div className="size-limit" style={{ top: y(upMax) }} aria-hidden="true">
                <span>{m.size.max(`${fmtCm(upMax)} cm`)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {(acrossMax !== undefined || upMax !== undefined) && (
        <p className="muted small size-note">
          {[across, up]
            .filter((side) => limits[side])
            .map((side) => m.size.limit(sideName(side), `${fmtCm(limits[side]!.max)} cm`))
            .join(' · ')}
        </p>
      )}
      {missing.length > 0 && <p className="muted small size-note">{m.size.missing(missing.map((i) => i.name).join(', '))}</p>}
    </details>
  )
}

/** One product: its outline (or picture), the dashed space it may take, and what sticks out hatched. */
function Figure({
  view,
  k,
  col,
  height,
  a,
  b,
  acrossMax,
  upMax,
  y,
  picture,
}: {
  view: View
  k: number
  col: number
  height: number
  a: number
  b: number
  acrossMax?: number
  upMax?: number
  y: (cm: number) => number
  picture: string | null
}) {
  const crop = useCrop(picture)
  const w = a * k
  // Front and from above: centred in its column. From the side: standing against the wall.
  const x0 = view === 'side' ? WALL + 2 : (col - w) / 2
  const nicheX =
    acrossMax !== undefined ? (view === 'side' ? [WALL + 2, WALL + 2 + acrossMax * k] : [(col - acrossMax * k) / 2, (col + acrossMax * k) / 2]) : null
  const top = Math.min(y(0), y(b))
  const h = Math.abs(y(b) - y(0))
  const fits = crop && picture && fitsFront(crop.crop, crop.ratio, a, b)
  const reach = Math.max(b, upMax ?? 0)
  const over: { x: number; y: number; width: number; height: number }[] = []
  if (nicheX) {
    if (x0 < nicheX[0]) over.push({ x: x0, y: top, width: nicheX[0] - x0, height: h })
    if (x0 + w > nicheX[1]) over.push({ x: nicheX[1], y: top, width: x0 + w - nicheX[1], height: h })
  }
  if (upMax !== undefined && b > upMax) over.push({ x: x0, y: Math.min(y(upMax), y(b)), width: w, height: Math.abs(y(b) - y(upMax)) })

  return (
    <svg className="size-fig" width={col} height={height} aria-hidden="true">
      {view === 'side' && <line className="size-wall" x1={WALL} x2={WALL} y1={y(0)} y2={y(reach * 1.03)} />}
      <rect className={`size-box${fits ? ' pic' : ''}`} x={x0} y={top} width={w} height={h} />
      {fits && (
        <svg
          x={x0}
          y={top}
          width={w}
          height={h}
          viewBox={`${crop.crop.x * crop.nw} ${crop.crop.y * crop.nh} ${crop.crop.w * crop.nw} ${crop.crop.h * crop.nh}`}
          preserveAspectRatio="xMidYMax meet"
        >
          <image href={picture} width={crop.nw} height={crop.nh} />
        </svg>
      )}
      {over.map((r, i) => (
        <rect key={i} className="size-over" fill="url(#size-over)" {...r} />
      ))}
      <rect className="size-line" x={x0} y={top} width={w} height={h} />
      {nicheX && nicheX.map((x, i) => <line key={i} className="size-niche" x1={x} x2={x} y1={y(0)} y2={y(reach * 1.03)} />)}
    </svg>
  )
}

/** A plain pictogram 1.75 m tall, standing on the floor. */
function Person({ k, height }: { k: number; height: number }) {
  const s = (PERSON / 175) * k
  return (
    <svg className="size-fig" width={Math.max(PERSON_WIDTH * k, MIN_COL)} height={height} aria-hidden="true">
      <g className="size-person" transform={`translate(${(Math.max(PERSON_WIDTH * k, MIN_COL) - PERSON_WIDTH * s) / 2} ${height - PERSON * k}) scale(${s})`}>
        <circle cx="22.5" cy="12" r="11" />
        <rect x="10" y="26" width="25" height="62" rx="9" />
        <rect x="2" y="28" width="7" height="58" rx="3.5" />
        <rect x="36" y="28" width="7" height="58" rx="3.5" />
        <rect x="11" y="80" width="10.5" height="95" rx="4" />
        <rect x="23.5" y="80" width="10.5" height="95" rx="4" />
      </g>
    </svg>
  )
}

/** Width of an element, followed as it changes. */
function useWidth<T extends HTMLElement>(): [number, RefObject<T | null>] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [width, ref]
}

interface Measured {
  crop: Crop
  /** Width : height of the whole picture. */
  ratio: number
  nw: number
  nh: number
}

/** Where the object sits in each picture, measured once per page visit. */
const measured = new Map<string, Measured | null>()

function useCrop(src: string | null): Measured | null {
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!src || measured.has(src)) return
    let live = true
    void measure(src).then((r) => {
      measured.set(src, r)
      if (live) redraw((n) => n + 1)
    })
    return () => {
      live = false
    }
  }, [src])
  return src ? (measured.get(src) ?? null) : null
}

async function measure(src: string): Promise<Measured | null> {
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const scale = Math.min(1, 160 / Math.max(nw, nh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(nw * scale))
    canvas.height = Math.max(1, Math.round(nh * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const crop = contentBox(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
    return { crop, ratio: nw / nh, nw, nh }
  } catch {
    return null
  }
}
