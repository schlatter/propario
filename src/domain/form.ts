import type { ShapePart } from '../db/types'
import type { Size } from './size'

/**
 * A product's form (src/db/types.ts ShapePart): parts stacked from the floor inside its size.
 * The size fields stay the measure – a form only says where the product is cut and how wide and
 * deep each part is. Read from a dimension drawing where there is one, so little has to be typed.
 */

const complete = (s: Size): s is Required<Size> => !!(s.width && s.height && s.depth)

/**
 * A saved form inside the current size: the heights scaled to add up to the height, no part
 * wider or deeper than the product. Without a complete size the form as it is.
 */
export function fitShape(shape: ShapePart[], size: Size): ShapePart[] {
  if (!shape.length || !complete(size)) return shape
  const sum = shape.reduce((n, p) => n + p.h, 0)
  return shape.map((p) => ({ w: Math.min(p.w, size.width), h: (p.h * size.height) / sum, d: Math.min(p.d, size.depth) }))
}

/** Splits one box into a lower and an upper part at the given height, both as wide and deep as the whole. */
export function splitAt(size: Required<Size>, cut: number): ShapePart[] {
  return [
    { w: size.width, h: cut, d: size.depth },
    { w: size.width, h: size.height - cut, d: size.depth },
  ]
}

/**
 * Moves the cut above part `i` to `h` (its new height): the part above gives or takes the
 * difference, so the whole stays as high as it is. Kept between 1 cm and what the two have.
 */
export function moveCut(shape: ShapePart[], i: number, h: number): ShapePart[] {
  if (i >= shape.length - 1) return shape
  const both = shape[i].h + shape[i + 1].h
  const next = Math.min(Math.max(h, 1), both - 1)
  return shape.map((p, n) => (n === i ? { ...p, h: next } : n === i + 1 ? { ...p, h: both - next } : p))
}

/** Splits the top part in two halves – the whole stays the same. */
export function addPart(shape: ShapePart[]): ShapePart[] {
  const top = shape[shape.length - 1]
  const lower = Math.round((top.h / 2) * 10) / 10
  return [...shape.slice(0, -1), { ...top, h: lower }, { ...top, h: Math.round((top.h - lower) * 10) / 10 }]
}

/** Removes part `i`; its height goes to the part above it (the one below, for the top part). */
export function removePart(shape: ShapePart[], i: number): ShapePart[] {
  if (shape.length <= 2) return []
  const into = i === shape.length - 1 ? i - 1 : i + 1
  return shape.map((p, n) => (n === into ? { ...p, h: p.h + shape[i].h } : p)).filter((_, n) => n !== i)
}

// ---------- reading a form from a drawing ----------

/**
 * How wide the object is in each row of a picture (top to bottom), as a share of the crop's
 * width – from its leftmost to its rightmost dark or coloured pixel. Null for an empty row.
 */
export function rowExtents(rgba: Uint8ClampedArray, width: number, height: number): (number | null)[] {
  const rows: (number | null)[] = []
  for (let y = 0; y < height; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (rgba[i + 3] < 128 || Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) >= 200) continue
      if (left < 0) left = x
      right = x
    }
    rows.push(left < 0 ? null : (right - left + 1) / width)
  }
  return rows
}

/** One step of a profile: how high it is and how wide, both as shares (0 … 1), from the bottom up. */
export interface Step {
  h: number
  v: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * The steps of a profile read row by row from the top: where the width changes by more than
 * `jump` and stays so for at least `min` of the height, a new part begins. Short runs – a
 * moulding, a handle, a figure in the drawing – go to their neighbour; empty rows are skipped.
 */
export function profileSteps(rows: (number | null)[], jump = 0.06, min = 0.08): Step[] {
  const known = rows.map((r, i) => ({ r, i })).filter((x): x is { r: number; i: number } => x.r !== null)
  if (!known.length) return []
  // Smooth over a few rows so a thin line does not count.
  const k = Math.max(1, Math.round(known.length / 60))
  const smooth = known.map((_, n) => median(known.slice(Math.max(0, n - k), n + k + 1).map((x) => x.r)))
  const runs: { from: number; to: number; values: number[] }[] = []
  for (let n = 0; n < smooth.length; n++) {
    const last = runs[runs.length - 1]
    if (last && Math.abs(median(last.values) - smooth[n]) <= jump) {
      last.to = n
      last.values.push(smooth[n])
    } else runs.push({ from: n, to: n, values: [smooth[n]] })
  }
  // Merge short runs into the neighbour that is most alike, until every run is long enough.
  const total = smooth.length
  const long = (r: (typeof runs)[number]) => (r.to - r.from + 1) / total >= min
  while (runs.length > 1 && runs.some((r) => !long(r))) {
    const i = runs.findIndex((r) => !long(r))
    const v = median(runs[i].values)
    const prev = runs[i - 1]
    const next = runs[i + 1]
    const into = !next || (prev && Math.abs(median(prev.values) - v) <= Math.abs(median(next.values) - v)) ? i - 1 : i + 1
    const a = runs[Math.min(i, into)]
    const b = runs[Math.max(i, into)]
    runs.splice(Math.min(i, into), 2, { from: a.from, to: b.to, values: [...a.values, ...b.values] })
  }
  // Neighbours alike again after the merging – a short interruption between them – are one part.
  for (let i = runs.length - 1; i > 0; i--)
    if (Math.abs(median(runs[i].values) - median(runs[i - 1].values)) <= jump)
      runs.splice(i - 1, 2, { from: runs[i - 1].from, to: runs[i].to, values: [...runs[i - 1].values, ...runs[i].values] })
  const widest = Math.max(...runs.map((r) => median(r.values)))
  return runs.map((r) => ({ h: (r.to - r.from + 1) / total, v: median(r.values) / widest })).reverse()
}

/**
 * A form from the steps of a side drawing (depths) and, when there is one, the front (widths at
 * the same heights) – in the product's own size, rounded to half centimetres. One part when the
 * drawing shows no step.
 */
export function formFromProfiles(size: Required<Size>, side: Step[], frontRows?: (number | null)[]): ShapePart[] {
  const r = (n: number) => Math.round(n * 2) / 2
  if (side.length < 2) return []
  // Widths: the front's extent at the middle of each part, relative to its widest row.
  const known = frontRows?.filter((x): x is number => x !== null) ?? []
  const widest = known.length ? Math.max(...known) : 0
  let below = 0
  const parts = side.map((s) => {
    let w = size.width
    if (frontRows && widest > 0) {
      // Rows run from the top; the part's middle counted from the bottom.
      const mid = 1 - (below + s.h / 2)
      const row = frontRows[Math.min(frontRows.length - 1, Math.max(0, Math.round(mid * (frontRows.length - 1))))]
      if (row !== null && row !== undefined) w = (row / widest) * size.width
    }
    below += s.h
    return { w: r(w), h: s.h * size.height, d: r(s.v * size.depth) }
  })
  // Heights rounded, the top part takes the rest: the whole stays exactly as high.
  const rounded = parts.map((p) => ({ ...p, h: r(p.h) }))
  rounded[rounded.length - 1].h = r(size.height - rounded.slice(0, -1).reduce((n, p) => n + p.h, 0))
  return rounded
}
