import type { Crop } from '../db/types'
import type { Size } from './size'

/**
 * The 3D view and AR (src/pages/project/Model3D.tsx) in plain numbers: every product a box of its
 * real size in metres, standing side by side on one floor, a person beside them for scale. The
 * front faces the viewer (+z); pictures marked as front, side or back cover those faces.
 */

export interface Placed {
  id: string
  /** Width, height, depth in metres. */
  w: number
  h: number
  d: number
  /** Centre across, metres; every box stands on the floor (y = 0) with its back at z = −d/2. */
  x: number
}

/** Gap between boxes and to the person, metres. */
export const GAP_M = 0.3
/** The reference person: 1.75 m tall, about 0.45 m across. */
export const PERSON_M = { h: 1.75, w: 0.45 }

/** Products with all three sides, side by side and centred; the person stands left of them. */
export function arrange(items: { id: string; size: Size }[]): { boxes: Placed[]; personX: number } {
  const full = items.filter((i) => i.size.width && i.size.height && i.size.depth)
  const widths = full.map((i) => i.size.width! / 100)
  const total = widths.reduce((n, w) => n + w, 0) + GAP_M * Math.max(0, full.length - 1)
  let x = -total / 2
  const boxes = full.map((i, n) => {
    const w = widths[n]
    const placed = { id: i.id, w, h: i.size.height! / 100, d: i.size.depth! / 100, x: x + w / 2 }
    x += w + GAP_M
    return placed
  })
  return { boxes, personX: -total / 2 - GAP_M - PERSON_M.w / 2 }
}

/**
 * Where on a texture the part of a picture lies: three.js counts from the bottom left, a crop from
 * the top left. Without a crop the whole picture.
 */
export function cropToUv(crop: Crop | null): { repeat: [number, number]; offset: [number, number] } {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 }
  return { repeat: [c.w, c.h], offset: [c.x, 1 - c.y - c.h] }
}

/** How far the camera stands back so the whole group fits a view `fov` degrees high. */
export function cameraDistance(width: number, height: number, fov: number, aspect: number): number {
  const half = (fov * Math.PI) / 360
  const byHeight = height / 2 / Math.tan(half)
  const byWidth = width / 2 / (Math.tan(half) * aspect)
  return Math.max(byHeight, byWidth) * 1.25
}
