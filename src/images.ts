/**
 * Product images: fetched once from the shop page (through /api/product-image), shrunk in the
 * browser (which also drops any metadata) and stored on this server in the comparison
 * (/api/images). Pages only ever show images from this server, so no shop learns who looks.
 */
import { api } from './api'
import { takeFacts, updateProduct } from './db/repo'
import type { Product } from './db/types'
import { safeHref } from './domain/values'
import { cleanFacts, type ProductFacts } from './shared/product-facts.ts'
import { IMAGE_PATH } from './shared/records.ts'

/** Longest side of a stored image. Big enough for the hover preview, small enough for backups (~20–60 KB). */
export const IMAGE_MAX_SIDE = 640

export type ImageErrorCode =
  'unavailable' | 'blocked' | 'not-found' | 'no-image' | 'too-large' | 'timeout' | 'invalid-url' | 'forbidden-address' | 'unreadable' | 'failed'

export class ImageError extends Error {
  code: ImageErrorCode
  /** Facts of a page that was read although no picture came of it. */
  facts?: ProductFacts
  /** What was taken from those facts (set by loadProductImage). */
  filled?: string[]
  constructor(code: ImageErrorCode, facts?: ProductFacts) {
    super(code)
    this.code = code
    this.facts = facts
  }
}

const KNOWN: ImageErrorCode[] = ['blocked', 'not-found', 'no-image', 'too-large', 'timeout', 'invalid-url', 'forbidden-address']

/** The image to show for a product: only copies stored on this server. */
export function productImage(p: Pick<Product, 'image'> | null | undefined): string | null {
  return p?.image && IMAGE_PATH.test(p.image) ? p.image : null
}

/** Ask the server for the main image of a product page (or an image URL). */
export async function fetchRemoteImage(url: string, signal?: AbortSignal): Promise<{ blob: Blob; source: string; facts: ProductFacts }> {
  let res: Response
  try {
    res = await fetch(`/api/product-image?url=${encodeURIComponent(url)}`, { signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ImageError('unavailable')
  }
  const type = res.headers.get('content-type') ?? ''
  if (res.ok && type.startsWith('image/')) {
    return { blob: await res.blob(), source: decodeURI(res.headers.get('x-image-source') ?? url), facts: readFacts(res.headers.get('x-product-facts')) }
  }
  if (type.includes('json')) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; facts?: unknown }
    const code = KNOWN.find((c) => c === body.error)
    if (code) throw new ImageError(code, body.facts ? cleanFacts(body.facts) : undefined)
    if (body.error === 'disabled') throw new ImageError('unavailable')
    throw new ImageError('failed')
  }
  // No API behind this address (static hosting, `vite preview` without the plugin …).
  throw new ImageError('unavailable')
}

/** The product facts the server found on the page (base64url JSON); checked again here, dropped when unreadable. */
function readFacts(header: string | null): ProductFacts {
  try {
    if (!header) return {}
    const bin = atob(header.replace(/-/g, '+').replace(/_/g, '/'))
    return cleanFacts(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))))
  } catch {
    return {}
  }
}

let webpOk: boolean | null = null
function canEncodeWebp(): boolean {
  if (webpOk === null) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webpOk
}

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(blob)
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      /* fall back to <img> (e.g. formats createImageBitmap does not handle) */
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } catch {
    throw new ImageError('unreadable')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Shrink any decodable image to IMAGE_MAX_SIDE and return it as compact WebP (or JPEG). */
export async function shrinkImage(blob: Blob, maxSide = IMAGE_MAX_SIDE): Promise<Blob> {
  if (!blob.type.startsWith('image/') || blob.type.includes('svg')) throw new ImageError('unreadable')
  const img = await decode(blob)
  try {
    if (!img.width || !img.height) throw new ImageError('unreadable')
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageError('unreadable')
    const webp = canEncodeWebp()
    if (!webp) {
      // JPEG has no transparency; product shots expect white.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img.source, 0, 0, w, h)
    const type = webp ? 'image/webp' : 'image/jpeg'
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.84))
    if (!out) throw new ImageError('unreadable')
    return out
  } finally {
    img.close()
  }
}

/** Stores an image in a comparison on the server; returns its path. */
export async function uploadImage(projectId: string, blob: Blob): Promise<string> {
  return (await api<{ path: string }>(`/api/images?project=${encodeURIComponent(projectId)}`, { raw: blob })).path
}

/**
 * Download, shrink and store the image for one product. `from` defaults to the image URL, then
 * the product link. What the page says about the product fills its empty fields (see
 * src/domain/page-import.ts) – also when the page has no usable picture. Returns the facts and
 * what was taken from them; on failure the ImageError carries the same.
 */
export async function loadProductImage(p: Product, from?: string, signal?: AbortSignal): Promise<{ facts: ProductFacts; filled: string[] }> {
  const target = from ?? (safeHref(p.imageUrl) || safeHref(p.url))
  if (!target) throw new ImageError('invalid-url')
  let got: Awaited<ReturnType<typeof fetchRemoteImage>>
  try {
    got = await fetchRemoteImage(target, signal)
  } catch (e) {
    if (e instanceof ImageError && e.facts) e.filled = await takeFacts(p, e.facts)
    throw e
  }
  const image = await uploadImage(p.projectId, await shrinkImage(got.blob))
  await updateProduct(p, { image, imageUrl: p.imageUrl || got.source })
  return { facts: got.facts, filled: await takeFacts(p, got.facts) }
}

/** Store an image the user picked, pasted or dropped. */
export async function setProductImageFromBlob(p: Product, blob: Blob): Promise<void> {
  await updateProduct(p, { image: await uploadImage(p.projectId, await shrinkImage(blob)) })
}

export interface BulkResult {
  loaded: number
  failed: { product: Product; code: ImageErrorCode }[]
}

/** Products that have a link but no stored image yet. */
export const missingImages = (products: Product[]) => products.filter((p) => !p.image && (safeHref(p.imageUrl) || safeHref(p.url)))

/** Load images for several products, a few at a time. Stops early when the server has no image API. */
export async function loadImages(products: Product[], onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<BulkResult> {
  const queue = [...products]
  const result: BulkResult = { loaded: 0, failed: [] }
  let done = 0
  let unavailable = false
  const worker = async () => {
    for (let p = queue.shift(); p && !unavailable && !signal?.aborted; p = queue.shift()) {
      try {
        await loadProductImage(p, undefined, signal)
        result.loaded++
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        const code = e instanceof ImageError ? e.code : 'failed'
        if (code === 'unavailable') unavailable = true
        result.failed.push({ product: p, code })
      }
      onProgress(++done, products.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, products.length) }, worker))
  if (unavailable) throw new ImageError('unavailable')
  return result
}

/** First image in a paste or drop, as a file or as a URL to fetch. */
export function imageFromTransfer(dt: DataTransfer | null): { file: File } | { url: string } | null {
  if (!dt) return null
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) return { file: f }
    }
  }
  for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith('image/')) return { file: f }
  const html = dt.getData('text/html')
  const src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
  const url =
    safeHref(src?.replace(/&amp;/g, '&') ?? '') ??
    safeHref(dt.getData('text/uri-list').split('\n')[0]?.trim() ?? '') ??
    safeHref(dt.getData('text/plain').trim())
  return url ? { url } : null
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

/**
 * Copies products' images into a comparison: data URLs (backups, version 0.1) and images of
 * other comparisons (duplicates) are uploaded; anything unreadable is dropped, never the product.
 */
export async function rehostImages(products: Product[], projectId: string): Promise<Product[]> {
  const out: Product[] = []
  for (const p of products) {
    let image = ''
    try {
      if (p.image?.startsWith('data:image/')) image = await uploadImage(projectId, await shrinkImage(await dataUrlToBlob(p.image)))
      else if (p.image && IMAGE_PATH.test(p.image)) image = await uploadImage(projectId, await (await fetch(p.image)).blob())
    } catch {
      image = ''
    }
    out.push({ ...p, image })
  }
  return out
}

/** For backups: replaces image paths with data URLs so the file is complete on its own. */
export async function inlineImages(products: Product[]): Promise<Product[]> {
  return Promise.all(
    products.map(async (p) => {
      if (!p.image || !IMAGE_PATH.test(p.image)) return p
      try {
        const blob = await (await fetch(p.image)).blob()
        const image = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result))
          r.onerror = () => reject(r.error)
          r.readAsDataURL(blob)
        })
        return { ...p, image }
      } catch {
        return p
      }
    }),
  )
}
