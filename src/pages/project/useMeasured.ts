import { useEffect, useState } from 'react'
import type { Crop } from '../../db/types'
import { contentBox } from '../../domain/size'
import { rowExtents } from '../../domain/form'

/**
 * Where the object sits in a picture (white background left out) and the picture's own size,
 * measured once per page visit in a small canvas. Pictures come from this server only.
 */
export interface Measured {
  crop: Crop
  /** Width : height of the whole picture. */
  ratio: number
  nw: number
  nh: number
}

/** Where the object sits in each picture, measured once per page visit. */
const measured = new Map<string, Measured | null>()

export function useMeasured(src: string | null): Measured | null {
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

/** The same, outside React (the 3D view): measured once, then from the cache. */
export async function measureOnce(src: string): Promise<Measured | null> {
  if (!measured.has(src)) measured.set(src, await measure(src))
  return measured.get(src) ?? null
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

/**
 * How wide the object is in each row of a part of a picture (src/domain/form.ts rowExtents),
 * read at up to 300 rows. Null when the picture cannot be read.
 */
export async function readRows(src: string, crop: Crop | null): Promise<(number | null)[] | null> {
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    const c = crop ?? (await measureOnce(src))?.crop ?? { x: 0, y: 0, w: 1, h: 1 }
    const sw = img.naturalWidth * c.w
    const sh = img.naturalHeight * c.h
    const scale = Math.min(1, 300 / sh)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw * scale))
    canvas.height = Math.max(1, Math.round(sh * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, img.naturalWidth * c.x, img.naturalHeight * c.y, sw, sh, 0, 0, canvas.width, canvas.height)
    return rowExtents(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
  } catch {
    return null
  }
}
