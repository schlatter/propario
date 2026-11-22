import type { Crop, ShapePart } from '../db/types'
import { fitShape } from './form'
import { drawnSize, type Size } from './size'

/**
 * The 3D view and AR (src/pages/project/Model3D.tsx) in plain numbers: every product a box of its
 * real size in metres, standing side by side on one floor, a person beside them for scale. The
 * front faces the viewer (+z); pictures marked as front, side or back cover those faces.
 */

/** One part of a product in metres: its size, where it starts above the floor, and its centre in depth (back against the wall). */
export interface Part3D {
  w: number
  h: number
  d: number
  y0: number
  z: number
}

export interface Placed {
  id: string
  /** The whole product, metres: widest width, full height, deepest depth. */
  w: number
  h: number
  d: number
  /** Centre across, metres; it stands on the floor (y = 0), its footprint centred on z = 0. */
  x: number
  /** Parts stacked from the floor, backs flush at z = −d/2. One part when the product has no form. */
  parts: Part3D[]
}

/** Gap between boxes and to the person, metres. */
export const GAP_M = 0.3
/** The reference person: 1.75 m tall, about 0.45 m across. */
export const PERSON_M = { h: 1.75, w: 0.45 }

/** A product's parts in metres, or null when its size is not fully known. */
export function partsOf(size: Size, shape?: ShapePart[]): Omit<Placed, 'id' | 'x'> | null {
  const s = drawnSize(size, shape)
  if (!s.width || !s.height || !s.depth) return null
  const list = shape?.length ? fitShape(shape, s) : [{ w: s.width, h: s.height, d: s.depth }]
  const D = s.depth / 100
  let y0 = 0
  const parts = list.map((p) => {
    const part = { w: p.w / 100, h: p.h / 100, d: p.d / 100, y0, z: -D / 2 + p.d / 200 }
    y0 += part.h
    return part
  })
  return { w: s.width / 100, h: s.height / 100, d: D, parts }
}

/** Products whose size is known, side by side and centred; the person stands left of them. */
export function arrange(items: { id: string; size: Size; shape?: ShapePart[] }[]): { boxes: Placed[]; personX: number } {
  const full = items.map((i) => ({ id: i.id, p: partsOf(i.size, i.shape) })).filter((i) => i.p)
  const total = full.reduce((n, i) => n + i.p!.w, 0) + GAP_M * Math.max(0, full.length - 1)
  let x = -total / 2
  const boxes = full.map(({ id, p }) => {
    const placed = { id, ...p!, x: x + p!.w / 2 }
    x += p!.w + GAP_M
    return placed
  })
  return { boxes, personX: -total / 2 - GAP_M - PERSON_M.w / 2 }
}

/**
 * The share of a front picture that falls on one part: the picture shows the whole front, so a
 * lower part gets the lower slice, a narrower part the middle of it.
 */
export function frontSlice(crop: Crop, part: Part3D, whole: { w: number; h: number }): Crop {
  return {
    x: crop.x + (crop.w * (whole.w - part.w)) / 2 / whole.w,
    y: crop.y + crop.h * (1 - (part.y0 + part.h) / whole.h),
    w: (crop.w * part.w) / whole.w,
    h: (crop.h * part.h) / whole.h,
  }
}

/** The same for a side picture, with the front at its left: a shallower part gets the part towards the back. */
export function sideSlice(crop: Crop, part: Part3D, whole: { d: number; h: number }): Crop {
  return {
    x: crop.x + (crop.w * (whole.d - part.d)) / whole.d,
    y: crop.y + crop.h * (1 - (part.y0 + part.h) / whole.h),
    w: (crop.w * part.d) / whole.d,
    h: (crop.h * part.h) / whole.h,
  }
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
