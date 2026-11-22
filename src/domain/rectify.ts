/**
 * Straightening a photo taken from an angle: the four corners of the product's front in the
 * photo are mapped onto a rectangle of the front's real proportions (a homography). Then the
 * photo can cover the front in 3D and stand in the drawing to scale as if taken straight on.
 */

export interface Point {
  x: number
  y: number
}

/** Corners of the front in the photo, as shares (0 … 1) of its width and height: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point]

export type Matrix = [number, number, number, number, number, number, number, number, number]

/** The homography that maps the four `from` points onto the four `to` points (null when they are degenerate). */
export function homography(from: Quad, to: Quad): Matrix | null {
  // Eight equations in the eight unknowns h0 … h7 (h8 = 1).
  const a: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  const h = solve(a)
  return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null
}

/** Gaussian elimination with partial pivoting on an n × (n + 1) system. */
function solve(m: number[][]): number[] | null {
  const n = m.length
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r
    if (Math.abs(m[pivot][c]) < 1e-12) return null
    ;[m[c], m[pivot]] = [m[pivot], m[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]
    }
  }
  return m.map((row, i) => row[n] / row[i])
}

export function apply(h: Matrix, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8]
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w }
}

/** The unit square's corners in the order of a Quad. */
export const UNIT: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

/**
 * Straightens a photo: for every pixel of a `width` × `height` picture of the front, the colour
 * at the matching point inside `quad` (bilinear). `quad` is in shares of the photo's size.
 */
export function rectify(src: Uint8ClampedArray, sw: number, sh: number, quad: Quad, width: number, height: number): Uint8ClampedArray | null {
  const h = homography(UNIT, quad)
  if (!h) return null
  const out = new Uint8ClampedArray(width * height * 4)
  const at = (x: number, y: number, c: number) => src[(Math.min(sh - 1, Math.max(0, y)) * sw + Math.min(sw - 1, Math.max(0, x))) * 4 + c]
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const p = apply(h, { x: (i + 0.5) / width, y: (j + 0.5) / height })
      const x = p.x * sw - 0.5
      const y = p.y * sh - 0.5
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      const fx = x - x0
      const fy = y - y0
      const o = (j * width + i) * 4
      for (let c = 0; c < 4; c++)
        out[o + c] =
          at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy) + at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy
    }
  return out
}

/** The box around a quad – the part of the photo it lies in. */
export function quadBox(q: Quad): { x: number; y: number; w: number; h: number } {
  const xs = q.map((p) => p.x)
  const ys = q.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** The quad of a box, as a start for setting the corners by hand. */
export const boxQuad = (c: { x: number; y: number; w: number; h: number }): Quad => [
  { x: c.x, y: c.y },
  { x: c.x + c.w, y: c.y },
  { x: c.x + c.w, y: c.y + c.h },
  { x: c.x, y: c.y + c.h },
]
