import { useEffect, useState } from 'react'
import type { Corner, Crop } from '../../db/types'
import { rectify, type Quad } from '../../domain/rectify'
import { contentBox } from '../../domain/size'
import { rowExtents } from '../../domain/form'
import { looksLikeDrawing, pixelStats } from '../../domain/pictures'
import { drawingViews, isAnnotation, objectColor, type DrawingViews } from '../../domain/drawing'

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
    const c = crop ?? (await measureOnce(src))?.crop ?? null
    const { data } = await pixels(src, c, 300)
    return rowExtents(data.data, data.width, data.height)
  } catch {
    return null
  }
}

/** The pixels of a part of a picture, at most `maxSide` px on its longer side. */
async function pixels(src: string, crop: Crop | null, maxSide: number) {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const sw = img.naturalWidth * c.w
  const sh = img.naturalHeight * c.h
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  // The whole picture first, at its own size: a drawing without a size of its own (SVG) is
  // otherwise cut from a default-sized copy and comes out partly empty.
  const whole = document.createElement('canvas')
  whole.width = img.naturalWidth
  whole.height = img.naturalHeight
  const w = whole.getContext('2d')!
  w.fillStyle = '#fff'
  w.fillRect(0, 0, whole.width, whole.height)
  w.drawImage(img, 0, 0, whole.width, whole.height)
  ctx.drawImage(whole, whole.width * c.x, whole.height * c.y, sw, sh, 0, 0, canvas.width, canvas.height)
  return { canvas, ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height) }
}

/** Where the front and the side view are in a dimension drawing (src/domain/drawing.ts). */
export async function readDrawing(src: string): Promise<DrawingViews> {
  try {
    const { data } = await pixels(src, null, 600)
    return drawingViews(data.data, data.width, data.height)
  } catch {
    return { front: null, side: null }
  }
}

/**
 * A view of a dimension drawing for the faces in 3D: the product's lines only – the coloured
 * dimension lines and figures turned white, so a colour multiplied over it shows the product.
 */
export async function drawingTexture(src: string, crop: Crop | null): Promise<HTMLCanvasElement | null> {
  try {
    const { canvas, ctx, data } = await pixels(src, crop, 1024)
    const d = data.data
    for (let i = 0; i < d.length; i += 4) if (isAnnotation(d[i], d[i + 1], d[i + 2])) d.set([255, 255, 255], i)
    ctx.putImageData(data, 0, 0)
    return canvas
  } catch {
    return null
  }
}

/** The product's colour from its photo, as a CSS colour; null when there is none to read. */
export async function photoColor(src: string): Promise<string | null> {
  try {
    const crop = (await measureOnce(src))?.crop ?? null
    const { data } = await pixels(src, crop, 120)
    const c = objectColor(data.data)
    return c ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : null
  } catch {
    return null
  }
}

/** Whether a picture looks like a dimension drawing (src/domain/pictures.ts), or has a front and a side view in it. */
export async function looksDrawn(src: string): Promise<boolean> {
  try {
    const { data } = await pixels(src, null, 200)
    if (looksLikeDrawing(pixelStats(data.data))) return true
    const v = drawingViews(data.data, data.width, data.height)
    return !!(v.front && v.side)
  } catch {
    return false
  }
}

const straight = new Map<string, Promise<HTMLCanvasElement | null>>()

/**
 * A photo taken from an angle, straightened: the part inside `quad` (the side's corners in the
 * photo) as a picture of the side's own proportions (`aspect` = width : height). Once per page visit.
 */
export function straightened(src: string, quad: Corner[], aspect: number): Promise<HTMLCanvasElement | null> {
  const key = JSON.stringify([src, quad, Math.round(aspect * 1000)])
  if (!straight.has(key))
    straight.set(
      key,
      (async () => {
        try {
          const { data } = await pixels(src, null, 1400)
          const w = Math.round(Math.min(900, 900 * aspect))
          const h = Math.round(w / aspect)
          const out = rectify(data.data, data.width, data.height, quad as Quad, w, h)
          if (!out) return null
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const img = new ImageData(w, h)
          img.data.set(out)
          canvas.getContext('2d')!.putImageData(img, 0, 0)
          return canvas
        } catch {
          return null
        }
      })(),
    )
  return straight.get(key)!
}

/** The same as a picture address for the drawing to scale; null while it is made or when it cannot be. */
export function useStraightened(src: string | null, quad: Corner[] | undefined, aspect: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const key = src && quad ? JSON.stringify([src, quad, Math.round(aspect * 1000)]) : ''
  useEffect(() => {
    setUrl(null)
    if (!src || !quad) return
    let live = true
    void straightened(src, quad, aspect).then((c) => live && setUrl(c ? c.toDataURL('image/jpeg', 0.9) : null))
    return () => {
      live = false
    }
    // The key holds everything that changes the picture.
  }, [key])
  return url
}
