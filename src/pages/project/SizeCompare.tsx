import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Product } from '../../db/types'
import { displayName } from '../../domain/display'
import {
  drawnSize,
  fitsFront,
  partRects,
  pictureFor,
  scaleToFit,
  sizeFields,
  sizeLimits,
  sizeOf,
  VIEW_SIDES,
  viewsFor,
  type Side,
  type Size,
  type PartRect,
  type View,
  type ViewPic,
} from '../../domain/size'
import { useI18n } from '../../i18n'
import { productImage } from '../../images'
import type { ProjectData } from './useProjectData'
import { useMeasured, useStraightened } from './useMeasured'
import { fitShape } from '../../domain/form'
import { Open3D } from './Open3D'
import { PersonFigure } from '../../ui/PersonFigure'

/** Height of the reference person, cm. */
const PERSON = 175
/** Space between figures, px. */
const GAP = 12
/** Least width of a column, so its caption stays readable, px; two captions need more. */
const MIN_COL = 64
const MIN_OVERLAY = 150
/** Width of the reference person, cm. */
const PERSON_WIDTH = 45
/** Where the wall is drawn in the side view, px from the column's left edge. */
const WALL = 6

type Layout = 'beside' | 'overlay'
/** Side by side every product looks the same; one over the other, each its own line (see app.css). */
type Tone = 'single' | number
const toneClass = (t: Tone) => (t === 'single' ? 'single' : t === 0 ? 't0' : `t${((t - 1) % 4) + 1}`)

/**
 * The products to scale: from the front and the back (width × height), the side (depth ×
 * height) or from above (width × depth, wall at the top). Side by side, or – with two products,
 * as in a duel – one over the other. A person gives the scale; dashed lines show the space the
 * requirements leave, and what sticks out of it is hatched as not met. Pictures marked as a view
 * (src/pages/project/PictureViewDialog.tsx) fill their outline; the main picture stands for the
 * front only when its shape matches the measurements.
 */
export function SizeCompare({ products, data }: { products: Product[]; data: ProjectData }) {
  const { m, fmt } = useI18n()
  const fields = useMemo(() => sizeFields(data.properties), [data.properties])
  const limits = useMemo(() => sizeLimits(data.rules, fields), [data.rules, fields])
  const [chosen, setChosen] = useState<View>('front')
  const [layout, setLayout] = useState<Layout>('beside')
  const [width, ref] = useWidth<HTMLDivElement>()

  const items = products.map((p) => ({ product: p, size: drawnSize(sizeOf(p, fields), p.shape), name: p.model || displayName(p, m) }))
  const views = viewsFor(
    items.map((i) => i.size),
    1,
    products.some((p) => p.views?.back),
  )
  if (!views.length) return null
  const view = views.includes(chosen) ? chosen : views[0]
  const [across, up] = VIEW_SIDES[view]
  const shown = items.filter((i) => i.size[across] && i.size[up])
  const missing = items.filter((i) => !shown.includes(i))
  const overlay = layout === 'overlay' && shown.length >= 2
  const person = view !== 'top'
  const acrossMax = limits[across]?.max
  const upMax = limits[up]?.max

  // One scale in every view, set by the tallest thing standing (switching views keeps sizes) and
  // by the width: everything side by side without scrolling – unless that would make miniatures;
  // then the row scrolls sideways at a size that can still be read.
  const colCm = (s: Size) => Math.max(s[across]!, acrossMax ?? 0)
  const upCm = Math.max(...shown.map((i) => i.size[up]!), upMax ?? 0, person ? PERSON : 0) * 1.06
  const tallCm = Math.max(upCm, Math.max(...items.map((i) => i.size.height ?? 0), limits.height?.max ?? 0, PERSON) * 1.06)
  const figures = overlay ? [Math.max(...shown.map((i) => colCm(i.size)))] : shown.map((i) => colCm(i.size))
  const cols = [...(person ? [PERSON_WIDTH] : []), ...figures]
  const fixed = GAP * (cols.length + 1) + (view === 'side' ? figures.length * (WALL + 4) : 0) + (overlay ? MIN_OVERLAY - MIN_COL : 0)
  const tall = width < 600 ? 250 : 330
  const cap = tall / tallCm
  const k = width > 0 ? (scaleToFit(cols, fixed, width, MIN_COL, cap, view === 'top' ? 1 : 0.4) ?? Math.min(cap, view === 'top' ? 1.2 : 0.9)) : 0
  const stage = Math.round(upCm * k)
  /** Distance from the floor (or, from above, the wall) in px from the top of a column. */
  const y = (cm: number) => (view === 'top' ? cm * k : stage - cm * k)
  const colPx = (cm: number, least: number) => Math.max(cm * k + (view === 'side' ? WALL + 4 : 0), least)

  const sideName = (s: Side) => fields[s]?.name ?? m.size.sides[s]
  const fmtCm = (n: number) => fmt.number(Math.round(n * 10) / 10)
  const body = (i: (typeof shown)[number], tone: Tone) => ({
    a: i.size[across]!,
    b: i.size[up]!,
    parts: i.product.shape?.length ? partRects(view, fitShape(i.product.shape, i.size)) : null,
    // One over the other, only outlines: two pictures on top of each other hide both.
    picture: overlay ? null : pictureFor(i.product, productImage(i.product), view),
    tone,
  })
  const caption = (i: (typeof shown)[number], tone: Tone) => {
    const a = i.size[across]!
    const b = i.size[up]!
    const overA = acrossMax !== undefined && a > acrossMax
    const overB = upMax !== undefined && b > upMax
    return (
      <span className={`size-cap ${toneClass(tone)}`} key={i.product.id}>
        <span className="size-name" title={i.name}>
          {tone !== 'single' && (
            <svg className="size-swatch" width="20" height="12" aria-hidden="true">
              <g className={`size-body ${toneClass(tone)}`}>
                <rect className="size-box" x="1.5" y="1.5" width="17" height="9" />
                <rect className="size-line" x="1.5" y="1.5" width="17" height="9" />
              </g>
            </svg>
          )}
          {i.name}
        </span>
        <span className="size-dims" aria-hidden="true">
          <span className={overA ? 'over' : undefined}>{fmtCm(a)}</span> × <span className={overB ? 'over' : undefined}>{fmtCm(b)}</span> cm
        </span>
        <span className="sr-only">
          {sideName(across)} {fmtCm(a)} cm{overA ? ` (${m.size.tooBig})` : ''}, {sideName(up)} {fmtCm(b)} cm{overB ? ` (${m.size.tooBig})` : ''}
        </span>
      </span>
    )
  }
  const frame = { view, k, height: stage, acrossMax, upMax, y }

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
        {shown.length >= 2 && (
          <div className="seg" role="group" aria-label={m.size.layout}>
            {(['beside', 'overlay'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={l === layout} onClick={() => setLayout(l)}>
                {m.size.layouts[l]}
              </button>
            ))}
          </div>
        )}
        <Open3D products={products} data={data} />
        <p className="muted small">
          {overlay ? m.size.hintOverlay : m.size.hint}
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
            {overlay ? (
              <figure className="size-col overlay" style={{ width: colPx(figures[0], MIN_OVERLAY) }}>
                <Figure {...frame} col={colPx(figures[0], MIN_OVERLAY)} bodies={shown.map((i, n) => body(i, n))} />
                <figcaption>{shown.map((i, n) => caption(i, n))}</figcaption>
              </figure>
            ) : (
              shown.map((i) => (
                <figure
                  key={i.product.id}
                  className={`size-col${i.product.candidate === 'excluded' ? ' is-excluded' : ''}`}
                  style={{ width: colPx(colCm(i.size), MIN_COL) }}
                >
                  <Figure {...frame} col={colPx(colCm(i.size), MIN_COL)} bodies={[body(i, 'single')]} />
                  <figcaption>{caption(i, 'single')}</figcaption>
                </figure>
              ))
            )}
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

interface Frame {
  view: View
  k: number
  height: number
  acrossMax?: number
  upMax?: number
  y: (cm: number) => number
}

interface BodyProps {
  a: number
  b: number
  /** The form's parts in this view (cm), or null for one box. */
  parts: PartRect[] | null
  picture: ViewPic | null
  tone: Tone
}

/** One column: the wall (from the side), the dashed space the products may take, and the products in it. */
function Figure({ bodies, col, ...frame }: Frame & { col: number; bodies: BodyProps[] }) {
  const { view, k, height, acrossMax, upMax, y } = frame
  const nicheX =
    acrossMax !== undefined ? (view === 'side' ? [WALL + 2, WALL + 2 + acrossMax * k] : [(col - acrossMax * k) / 2, (col + acrossMax * k) / 2]) : null
  const reach = Math.max(...bodies.map((b) => b.b), upMax ?? 0)
  return (
    <svg className="size-fig" width={col} height={height} aria-hidden="true">
      {view === 'side' && <line className="size-wall" x1={WALL} x2={WALL} y1={y(0)} y2={y(reach * 1.03)} />}
      {bodies.map((b, i) => (
        <Body key={i} {...frame} {...b} col={col} nicheX={nicheX} />
      ))}
      {nicheX && nicheX.map((x, i) => <line key={i} className="size-niche" x1={x} x2={x} y1={y(0)} y2={y(reach * 1.03)} />)}
    </svg>
  )
}

/** One product: its outline (or picture) and what sticks out of the space, hatched – for a form of several parts, each part. */
function Body({ view, k, upMax, y, a, b, parts, picture, tone, col, nicheX }: Frame & BodyProps & { col: number; nicheX: number[] | null }) {
  const measured = useMeasured(picture?.src ?? null)
  // Taken from an angle with its corners set: straightened to exactly this outline.
  const straight = useStraightened(picture?.quad ? picture.src : null, picture?.quad, a / b)
  // Front, back and from above: centred in its column. From the side: standing against the wall.
  const across = (cm: number) => (view === 'side' ? WALL + 2 + cm * k : col / 2 + cm * k)
  const toPx = (r: PartRect) => ({ x: across(r.a0), y: Math.min(y(r.b0), y(r.b0 + r.b)), width: r.a * k, height: r.b * k })
  const whole = toPx({ a0: view === 'side' ? 0 : -a / 2, a, b0: 0, b })
  const boxes = parts ? parts.map(toPx) : [whole]
  const crop = picture?.crop ?? measured?.crop
  const drawn = picture && measured && crop && (picture.marked || fitsFront(crop, measured.ratio, a, b)) ? crop : null
  const over: { x: number; y: number; width: number; height: number }[] = []
  for (const r of boxes) {
    if (nicheX) {
      if (r.x < nicheX[0]) over.push({ ...r, width: Math.min(r.width, nicheX[0] - r.x) })
      if (r.x + r.width > nicheX[1]) over.push({ ...r, x: Math.max(r.x, nicheX[1]), width: r.x + r.width - Math.max(r.x, nicheX[1]) })
    }
    // Above the limit (from above: beyond it, away from the wall).
    if (upMax !== undefined) {
      const limit = y(upMax)
      const [lo, hi] = view === 'top' ? [Math.max(r.y, limit), r.y + r.height] : [r.y, Math.min(r.y + r.height, limit)]
      if (hi > lo) over.push({ x: r.x, y: lo, width: r.width, height: hi - lo })
    }
  }
  return (
    <g className={`size-body ${toneClass(tone)}`}>
      {boxes.map((r, i) => (
        <rect key={i} className={`size-box${drawn || straight ? ' pic' : ''}`} {...r} />
      ))}
      {straight ? (
        <image href={straight} {...whole} preserveAspectRatio="none" />
      ) : (
        drawn &&
        measured && (
          <svg
            {...whole}
            viewBox={`${drawn.x * measured.nw} ${drawn.y * measured.nh} ${drawn.w * measured.nw} ${drawn.h * measured.nh}`}
            preserveAspectRatio="xMidYMax meet"
          >
            <image href={picture!.src} width={measured.nw} height={measured.nh} />
          </svg>
        )
      )}
      {over.map((r, i) => (
        <rect key={i} className="size-over" fill="url(#size-over)" {...r} />
      ))}
      {boxes.map((r, i) => (
        <rect key={i} className="size-line" {...r} />
      ))}
    </g>
  )
}

/** A plain pictogram 1.75 m tall, standing on the floor. */
function Person({ k, height }: { k: number; height: number }) {
  const s = (PERSON / 175) * k
  return (
    <svg className="size-fig" width={Math.max(PERSON_WIDTH * k, MIN_COL)} height={height} aria-hidden="true">
      <PersonFigure transform={`translate(${(Math.max(PERSON_WIDTH * k, MIN_COL) - PERSON_WIDTH * s) / 2} ${height - PERSON * k}) scale(${s})`} />
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
