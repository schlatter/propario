import type { Crop } from '../db/types'

/**
 * A dimension drawing as shops show it (IKEA and many others): the product in dark lines from
 * the front and from the side, next to each other, with the dimension lines and figures in colour
 * (mostly blue). Without AI: the dark, uncoloured lines are the product, everything coloured is an
 * annotation; each view is a block of such lines with empty columns between them.
 */

/** A pixel of the product's lines: dark enough and without colour. Dimension lines are coloured. */
export function isInk(r: number, g: number, b: number, a = 255): boolean {
  if (a < 128) return false
  const chroma = Math.max(r, g, b) - Math.min(r, g, b)
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  // Even a greyish blue counts as colour: shops' dimension blue is often muted (≈ 75/99/120).
  return luma < 170 && chroma < 25
}

/** A coloured pixel – an annotation to leave out when the drawing becomes a texture. */
export function isAnnotation(r: number, g: number, b: number): boolean {
  return Math.max(r, g, b) - Math.min(r, g, b) >= 25
}

export interface DrawingViews {
  front: Crop | null
  side: Crop | null
}

/**
 * The views in a drawing: blocks of product lines side by side. The widest tall block is the
 * front, the next tall one the side; small blocks (a stray figure, a logo) do not count. A
 * drawing with one view only gives that one as the front.
 */
export function drawingViews(rgba: Uint8ClampedArray, width: number, height: number): DrawingViews {
  const cols = new Array<number>(width).fill(0)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (isInk(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) cols[x]++
    }
  // Blocks of columns with lines, split by gaps of at least 2 % of the width.
  const gap = Math.max(2, Math.round(width * 0.02))
  const blocks: { x0: number; x1: number }[] = []
  let empty = gap
  for (let x = 0; x < width; x++) {
    if (cols[x] > 0) {
      if (empty >= gap || !blocks.length) blocks.push({ x0: x, x1: x })
      else blocks[blocks.length - 1].x1 = x
      empty = 0
    } else empty++
  }
  const boxes = blocks.map(({ x0, x1 }) => {
    let y0 = height
    let y1 = -1
    for (let y = 0; y < height; y++)
      for (let x = x0; x <= x1; x++) {
        const i = (y * width + x) * 4
        if (isInk(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) {
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          break
        }
      }
    return { x: x0 / width, y: y0 / height, w: (x1 - x0 + 1) / width, h: (y1 - y0 + 1) / height }
  })
  const tallest = Math.max(0, ...boxes.map((b) => b.h))
  const tall = boxes.filter((b) => b.h >= tallest * 0.75 && b.h >= 0.2).sort((a, b) => b.w - a.w)
  // A side view has some depth: a lone tall line (a dimension line drawn dark) is none.
  const side = tall.slice(1).find((b) => b.w >= tall[0].w * 0.15) ?? null
  return { front: tall[0] ?? null, side }
}

/** The product's colour in a photo: the middle of its not-white pixels, channel by channel. */
export function objectColor(rgba: Uint8ClampedArray): [number, number, number] | null {
  const ch: number[][] = [[], [], []]
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128 || Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) >= 235) continue
    for (let c = 0; c < 3; c++) ch[c].push(rgba[i + c])
  }
  if (!ch[0].length) return null
  const mid = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  return [mid(ch[0]), mid(ch[1]), mid(ch[2])]
}
