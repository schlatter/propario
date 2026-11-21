import type { Crop, Priority, Product, PropertyDef, Requirement, ShapePart } from '../db/types'

export type { Crop }

/**
 * Sizes to scale: which fields of a comparison hold width, height and depth, each product's size
 * in centimetres, and the space the requirements leave ("Tiefe ≤ 40" → at most 40 cm deep). Only
 * what is known is drawn: a product without a number for a side is left out of that view.
 */

export type Side = 'width' | 'height' | 'depth'
export const SIDES: Side[] = ['width', 'height', 'depth']

/** Field names as people write them: "Breite", "Höhe (cm)", "Gesamttiefe", "Width" … */
const NAMES: Record<Side, RegExp> = {
  width: /^(?:gesamt-?|außen-?|aussen-?)?(?:breite|width)\b/i,
  height: /^(?:gesamt-?|außen-?|aussen-?)?(?:höhe|hoehe|height)\b/i,
  depth: /^(?:gesamt-?|außen-?|aussen-?)?(?:tiefe|depth)\b/i,
}

/** The number fields for width, height and depth – the first of each by field order. */
export function sizeFields(properties: PropertyDef[]): Partial<Record<Side, PropertyDef>> {
  const found: Partial<Record<Side, PropertyDef>> = {}
  for (const prop of [...properties].sort((a, b) => a.order - b.order)) {
    if (prop.type !== 'number' || toCm(1, prop.unit) === null) continue
    const side = SIDES.find((s) => NAMES[s].test(prop.name.trim()))
    if (side && !found[side]) found[side] = prop
  }
  return found
}

/** A length in the field's unit as centimetres; null for a unit that is no length. No unit counts as cm. */
export function toCm(value: number, unit: string): number | null {
  const u = unit.trim().toLowerCase()
  const factor = u === '' || u === 'cm' ? 1 : u === 'mm' ? 0.1 : u === 'm' ? 100 : u === 'in' || u === 'zoll' || u === '"' ? 2.54 : null
  return factor === null || !Number.isFinite(value) ? null : value * factor
}

export type Size = Partial<Record<Side, number>>

/** A product's known sides in cm; a side that is missing, zero or negative is left out. */
export function sizeOf(product: Product, fields: Partial<Record<Side, PropertyDef>>): Size {
  const size: Size = {}
  for (const side of SIDES) {
    const prop = fields[side]
    const raw = prop ? product.values[prop.id] : null
    const cm = typeof raw === 'number' ? toCm(raw, prop!.unit) : null
    if (cm !== null && cm > 0) size[side] = cm
  }
  return size
}

export interface Limit {
  /** At most this many cm. */
  max: number
  priority: Priority
  requirementId: string
}

/**
 * The space the requirements leave per side: "at most" conditions on a size field, and avoid or
 * exclusion conditions on "more than". The tightest one counts. Info rows check nothing and are skipped.
 */
export function sizeLimits(rules: Requirement[], fields: Partial<Record<Side, PropertyDef>>): Partial<Record<Side, Limit>> {
  const limits: Partial<Record<Side, Limit>> = {}
  for (const r of rules) {
    const c = r.condition
    if (!c || c.target.kind !== 'property' || r.priority === 'info') continue
    const target = c.target.propertyId
    const side = SIDES.find((s) => fields[s]?.id === target)
    if (!side) continue
    const against = r.priority === 'exclusion' || r.priority === 'avoid'
    if (!(against ? c.op === 'gt' || c.op === 'gte' : c.op === 'lte' || c.op === 'lt')) continue
    const value = typeof c.value === 'number' ? c.value : Number(String(c.value ?? '').replace(',', '.'))
    const max = Number.isFinite(value) && value > 0 ? toCm(value, fields[side]!.unit) : null
    if (max !== null && (!limits[side] || max < limits[side].max)) limits[side] = { max, priority: r.priority, requirementId: r.id }
  }
  return limits
}

/** Which sides each view shows: across × up. The view from above is seen with the wall at the top. */
export type View = 'front' | 'back' | 'side' | 'top'
export const VIEWS: View[] = ['front', 'back', 'side', 'top']
export const VIEW_SIDES: Record<View, [Side, Side]> = {
  front: ['width', 'height'],
  back: ['width', 'height'],
  side: ['depth', 'height'],
  top: ['width', 'depth'],
}

/**
 * Views in which at least `min` products can be drawn. The back only when someone marked a
 * picture of it – without one it is the front's outline once more.
 */
export function viewsFor(sizes: Size[], min = 1, withBack = false): View[] {
  return VIEWS.filter((v) => (v !== 'back' || withBack) && sizes.filter((s) => VIEW_SIDES[v].every((side) => s[side])).length >= min)
}

/** A picture to draw in a view: one marked for it, or for the front the main picture. */
export interface ViewPic {
  src: string
  /** null: the object is found in the picture automatically. */
  crop: Crop | null
  /** Marked by someone: drawn as it is. The main picture only when its shape fits. */
  marked: boolean
}

export function pictureFor(p: Pick<Product, 'views'>, main: string | null, view: View): ViewPic | null {
  const marked = view === 'top' ? undefined : p.views?.[view]
  if (marked) return { src: marked.src, crop: marked.crop, marked: true }
  return view === 'front' && main ? { src: main, crop: null, marked: false } : null
}

/**
 * Where the object in a product photo on white sits: the box around every pixel that is neither
 * transparent nor near white. The whole picture when nothing stands out.
 */
export function contentBox(rgba: Uint8ClampedArray, width: number, height: number): Crop {
  let left = width
  let right = -1
  let top = height
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (rgba[i + 3] < 128) continue
      if (Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) >= 240) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return { x: 0, y: 0, w: 1, h: 1 }
  return { x: left / width, y: top / height, w: (right - left + 1) / width, h: (bottom - top + 1) / height }
}

/**
 * Whether a cropped picture can stand for the front: only when its shape is close to the
 * product's width : height. A photo from an angle, a room shot or a detail is drawn as an
 * outline instead – a picture squeezed into the wrong box would claim a size it does not show.
 */
export function fitsFront(crop: Crop, pictureRatio: number, width: number, height: number): boolean {
  const shown = (crop.w * pictureRatio) / crop.h
  const real = width / height
  const r = shown / real
  return r > 0.8 && r < 1.25
}

/**
 * The largest scale (px per cm) at which columns of the given widths (cm), each at least `minCol`
 * px for its caption, plus `fixed` px fit into `width` – and no larger than `cap`. Null when they
 * do not fit even at `floor`: then the row scrolls rather than shrinking to miniatures.
 */
export function scaleToFit(cols: number[], fixed: number, width: number, minCol: number, cap: number, floor: number): number | null {
  const need = (k: number) => cols.reduce((n, c) => n + Math.max(c * k, minCol), fixed)
  if (need(cap) <= width) return cap
  if (need(floor) > width) return null
  let lo = floor
  let hi = cap
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (need(mid) <= width) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * A product with a form of several parts (src/db/types.ts ShapePart) measures what its parts
 * add up to: the widest width, the heights together, the deepest depth.
 */
export function shapeSize(shape: ShapePart[]): Size {
  return { width: Math.max(...shape.map((p) => p.w)), height: shape.reduce((n, p) => n + p.h, 0), depth: Math.max(...shape.map((p) => p.d)) }
}

/** The size to draw: the form's when it has one, otherwise the size fields'. */
export const drawnSize = (fields: Size, shape: ShapePart[] | undefined): Size => (shape?.length ? shapeSize(shape) : fields)

/** One part in a view, cm: across from the centre (front, back, above) or the wall (side); up from the floor or the wall. */
export interface PartRect {
  a0: number
  a: number
  b0: number
  b: number
}

/** The parts of a form as seen in a view; from above every part hangs from the wall. */
export function partRects(view: View, shape: ShapePart[]): PartRect[] {
  let below = 0
  return shape.map((p) => {
    const r =
      view === 'top'
        ? { a0: -p.w / 2, a: p.w, b0: 0, b: p.d }
        : view === 'side'
          ? { a0: 0, a: p.d, b0: below, b: p.h }
          : { a0: -p.w / 2, a: p.w, b0: below, b: p.h }
    below += p.h
    return r
  })
}
