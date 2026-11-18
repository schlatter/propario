/**
 * Product image fetcher: given a product page (or a direct image URL), find the page's main
 * image (Open Graph, Twitter card, JSON-LD Product, image_src) and return its bytes – plus the
 * facts the same page states about the product (GTIN, MPN, euro price), so nothing is read twice.
 *
 * Runs server-side because browsers cannot read other sites' pages (CORS). Called by the API
 * (signed-in users only, rate limited); the browser shrinks the result and stores it on this
 * server, so pictures are fetched once and then served from here.
 *
 * Safety: only http(s) on ports 80/443, every DNS answer (including redirect hops) must be a
 * public address, size and time limits, no cookies, SVG refused. Sites that refuse automated
 * requests are reported as "blocked" – there is deliberately no attempt to get around that.
 */
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import zlib from 'node:zlib'
import { cleanFacts, type ProductFacts } from '../src/shared/product-facts.ts'

const MAX_HTML = 4 * 1024 * 1024
const MAX_IMAGE = 10 * 1024 * 1024
const TIMEOUT_MS = 15000
const MAX_REDIRECTS = 5

export class ImageFetchError extends Error {
  code: string
  status: number
  constructor(code: string, status = 502) {
    super(code)
    this.code = code
    this.status = status
  }
}

const blocked = new net.BlockList()
for (const [net4, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as [string, number][])
  blocked.addSubnet(net4, bits, 'ipv4')
for (const [net6, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['64:ff9b::', 96],
] as [string, number][])
  blocked.addSubnet(net6, bits, 'ipv6')

/** True for loopback, private, link-local and other non-public addresses. */
export function isForbiddenAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return blocked.check(ip, 'ipv4')
  if (net.isIPv6(ip)) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return blocked.check(mapped[1], 'ipv4')
    return blocked.check(ip, 'ipv6')
  }
  return true
}

/** dns.lookup replacement that refuses non-public answers (checked at connect time, so redirects and DNS rebinding are covered). */
type LookupCallback = (err: Error | null, address?: any, family?: number) => void
function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err)
    const list = addresses as dns.LookupAddress[]
    if (!list.length || list.some((a) => isForbiddenAddress(a.address))) {
      return callback(new ImageFetchError('forbidden-address', 422))
    }
    if (options && options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

export function checkUrl(raw: string, allowPrivate = false): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new ImageFetchError('invalid-url', 400)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ImageFetchError('invalid-url', 400)
  if (u.username || u.password) throw new ImageFetchError('invalid-url', 400)
  if (!allowPrivate && u.port && u.port !== '80' && u.port !== '443') throw new ImageFetchError('invalid-url', 400)
  // IP literals never reach the DNS lookup, so check them here.
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (!allowPrivate && net.isIP(host) && isForbiddenAddress(host)) throw new ImageFetchError('forbidden-address', 422)
  return u
}

function decompress(res: http.IncomingMessage): NodeJS.ReadableStream {
  const enc = String(res.headers['content-encoding'] || '').toLowerCase()
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip())
  if (enc === 'deflate') return res.pipe(zlib.createInflate())
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress())
  return res
}

interface GetOptions {
  accept: string
  maxBytes: number
  userAgent: string
  allowPrivate: boolean
  deadline: number
  hops?: number
}
interface Got {
  status: number
  type: string
  body: Buffer
  url: string
}

/** GET with manual redirects; every hop goes through safeLookup. */
function get(url: string, { accept, maxBytes, userAgent, allowPrivate, deadline, hops = 0 }: GetOptions): Promise<Got> {
  return new Promise((resolve, reject) => {
    const u = checkUrl(url, allowPrivate)
    const lib = u.protocol === 'https:' ? https : http
    const left = deadline - Date.now()
    if (left <= 0) return reject(new ImageFetchError('timeout', 504))
    const req = lib.get(
      u,
      {
        headers: {
          'user-agent': userAgent,
          accept,
          'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
          'accept-encoding': 'gzip, deflate, br',
        },
        lookup: allowPrivate ? undefined : safeLookup,
        timeout: left,
      },
      (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          if (hops >= MAX_REDIRECTS) return reject(new ImageFetchError('failed', 502))
          let next
          try {
            next = new URL(res.headers.location, u).toString()
          } catch {
            return reject(new ImageFetchError('failed', 502))
          }
          return get(next, { accept, maxBytes, userAgent, allowPrivate, deadline, hops: hops + 1 }).then(resolve, reject)
        }
        const length = Number(res.headers['content-length'] || 0)
        if (length > maxBytes) {
          res.destroy()
          return reject(new ImageFetchError('too-large', 422))
        }
        const chunks: Buffer[] = []
        let size = 0
        const stream = decompress(res)
        stream.on('data', (c: Buffer) => {
          size += c.length
          if (size > maxBytes) {
            res.destroy()
            ;(stream as unknown as { destroy(): void }).destroy()
            reject(new ImageFetchError('too-large', 422))
          } else chunks.push(c)
        })
        stream.on('end', () =>
          resolve({ status, type: String(res.headers['content-type'] || '').toLowerCase(), body: Buffer.concat(chunks), url: u.toString() }),
        )
        stream.on('error', () => reject(new ImageFetchError('failed', 502)))
      },
    )
    req.on('timeout', () => req.destroy(new ImageFetchError('timeout', 504)))
    req.on('error', (e: NodeJS.ErrnoException) =>
      reject(e instanceof ImageFetchError ? e : new ImageFetchError(e && e.code === 'ENOTFOUND' ? 'not-found' : 'failed', 502)),
    )
  })
}

function statusError(status: number): ImageFetchError {
  if (status === 404 || status === 410) return new ImageFetchError('not-found', 422)
  if (status === 401 || status === 403 || status === 429 || status === 400 || status === 503) return new ImageFetchError('blocked', 422)
  return new ImageFetchError('failed', 502)
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all: string, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

function ldImages(node: any, out: string[], depth = 0): void {
  if (!node || depth > 8) return
  if (Array.isArray(node)) {
    for (const n of node) ldImages(n, out, depth + 1)
    return
  }
  if (typeof node !== 'object') return
  const type = ([] as unknown[]).concat(node['@type'] || []).map(String)
  if (type.some((t) => /product/i.test(t)) && node.image) {
    for (const img of ([] as any[]).concat(node.image)) {
      if (typeof img === 'string') out.push(img)
      else if (img && typeof img === 'object' && (img.url || img.contentUrl)) out.push(String(img.url || img.contentUrl))
    }
  }
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'offers']) if (node[key]) ldImages(node[key], out, depth + 1)
}

/** Candidate image URLs of an HTML page, best first, resolved against the page URL. */
export function extractImageCandidates(html: string, pageUrl: string): string[] {
  const og: string[] = []
  const twitter: string[] = []
  const ld: string[] = []
  const other: string[] = []
  for (const m of html.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const a = attrs(m[0])
    if (m[1].toLowerCase() === 'meta') {
      const key = (a.property || a.name || a.itemprop || '').toLowerCase()
      const value = a.content
      if (!value) continue
      if (key === 'og:image' || key === 'og:image:secure_url' || key === 'og:image:url') og.push(value)
      else if (key === 'twitter:image' || key === 'twitter:image:src') twitter.push(value)
      else if (key === 'image' && a.itemprop) other.push(value)
    } else if ((a.rel || '').toLowerCase() === 'image_src' && a.href) other.push(a.href)
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ldImages(JSON.parse(m[1].trim()), ld)
    } catch {
      /* broken JSON-LD is common; ignore */
    }
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of [...og, ...ld, ...twitter, ...other]) {
    let abs: URL
    try {
      abs = new URL(decodeEntities(raw.trim()), pageUrl)
    } catch {
      continue
    }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue
    if (/\.svg(\?|$)/i.test(abs.pathname)) continue
    const key = abs.toString()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(key)
    }
  }
  return result
}

const GTIN_KEYS = ['gtin13', 'gtin', 'gtin14', 'gtin12', 'gtin8']

function ldFacts(node: any, raw: Record<string, unknown>, depth = 0): void {
  if (!node || depth > 8 || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const n of node) ldFacts(n, raw, depth + 1)
    return
  }
  const type = ([] as unknown[]).concat(node['@type'] || []).map(String)
  if (type.some((t) => /product/i.test(t))) {
    raw.gtin ??= GTIN_KEYS.map((k) => node[k]).find((v) => v !== undefined)
    raw.mpn ??= node.mpn
    for (const offer of ([] as any[]).concat(node.offers || [])) {
      if (raw.price !== undefined || !offer || typeof offer !== 'object') continue
      if (String(offer.priceCurrency ?? '').toUpperCase() === 'EUR') raw.price = offer.price ?? offer.lowPrice
    }
  }
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item']) if (node[key]) ldFacts(node[key], raw, depth + 1)
}

/** What a page states about its product (JSON-LD first, then microdata); only well-formed values. */
export function extractProductFacts(html: string): ProductFacts {
  const raw: Record<string, unknown> = {}
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ldFacts(JSON.parse(m[1].trim()), raw)
    } catch {
      /* broken JSON-LD is common; ignore */
    }
  }
  const micro: Record<string, string> = {}
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0])
    if (a.itemprop && a.content && !(a.itemprop.toLowerCase() in micro)) micro[a.itemprop.toLowerCase()] = a.content
  }
  raw.gtin ??= GTIN_KEYS.map((k) => micro[k]).find((v) => v !== undefined)
  raw.mpn ??= micro.mpn
  if (raw.price === undefined && (micro.pricecurrency ?? '').toUpperCase() === 'EUR') raw.price = micro.price
  return cleanFacts(raw)
}

const isImage = (type: string) => type.startsWith('image/') && !type.includes('svg')

export interface FetchOptions {
  userAgent?: string
  allowPrivate?: boolean
  timeoutMs?: number
}

/** The main image of a product page (or a direct image URL). */
export async function fetchProductImage(
  url: string,
  opts: FetchOptions = {},
): Promise<{ body: Buffer; contentType: string; source: string; facts: ProductFacts }> {
  const userAgent = opts.userAgent || 'Mozilla/5.0 (compatible; Propario; product image preview)'
  const allowPrivate = !!opts.allowPrivate
  const deadline = Date.now() + (opts.timeoutMs || TIMEOUT_MS)
  checkUrl(url, allowPrivate)
  const page = await get(url, {
    accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.9,*/*;q=0.5',
    maxBytes: MAX_HTML,
    userAgent,
    allowPrivate,
    deadline,
  }).catch((e) => {
    // A direct image larger than the HTML limit: retry with the image limit.
    if (e instanceof ImageFetchError && e.code === 'too-large') {
      return get(url, { accept: 'image/*', maxBytes: MAX_IMAGE, userAgent, allowPrivate, deadline })
    }
    throw e
  })
  if (page.status >= 400) throw statusError(page.status)
  if (isImage(page.type)) return { body: page.body, contentType: page.type.split(';')[0], source: page.url, facts: {} }
  if (!page.type.includes('html')) throw new ImageFetchError('no-image', 422)

  const html = page.body.toString('utf8')
  const facts = extractProductFacts(html)
  const candidates = extractImageCandidates(html, page.url).slice(0, 3)
  if (!candidates.length) throw new ImageFetchError('no-image', 422)
  let lastError: ImageFetchError = new ImageFetchError('no-image', 422)
  for (const c of candidates) {
    try {
      const img = await get(c, { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', maxBytes: MAX_IMAGE, userAgent, allowPrivate, deadline })
      if (img.status >= 400) {
        lastError = statusError(img.status)
        continue
      }
      if (isImage(img.type)) return { body: img.body, contentType: img.type.split(';')[0], source: img.url, facts }
    } catch (e) {
      lastError = e instanceof ImageFetchError ? e : new ImageFetchError('failed', 502)
      if (lastError.code === 'timeout') break
    }
  }
  throw lastError
}
