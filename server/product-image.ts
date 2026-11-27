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
  /** What the page said about the product, when it was read but no picture came of it. */
  facts?: ProductFacts
  constructor(code: string, status = 502) {
    super(code)
    this.code = code
    this.status = status
  }
}

/**
 * Facts for the `X-Product-Facts` header: base64url JSON, at most about 6 KB. Table specs go
 * first when it is too long, then the description – structured data is the most reliable.
 */
export function encodeFacts(facts: ProductFacts): string {
  const enc = (f: ProductFacts) => Buffer.from(JSON.stringify(f)).toString('base64url')
  let f: ProductFacts = facts
  let out = enc(f)
  if (out.length > 6000) f = { ...f, specs: f.specs?.filter((s) => !s.table) }
  if ((out = enc(f)).length > 6000) f = { ...f, description: undefined }
  if ((out = enc(f)).length > 6000) f = { ...f, images: f.images?.slice(0, 3) }
  while ((out = enc(f)).length > 6000 && f.specs?.length) f = { ...f, specs: f.specs.slice(0, -5) }
  return out
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

/**
 * A bot check instead of the page: Amazon answers addresses of data centres with a captcha page
 * (status 200, a few kB), others with a challenge. Asked only when nothing of a product was found,
 * so a real product page with a captcha in its newsletter form is never taken for one.
 */
export function isChallengePage(html: string): boolean {
  return /validatecaptcha|captcha|challenge-platform|cf-chl-|cf_chl_/i.test(html)
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
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'offers', 'object']) if (node[key]) ldImages(node[key], out, depth + 1)
}

/** Candidate image URLs of an HTML page, best first, resolved against the page URL. */
export function extractImageCandidates(html: string, pageUrl: string): string[] {
  const og: string[] = []
  const twitter: string[] = []
  const ld: string[] = []
  const hires: string[] = []
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
  // Amazon's pages state no Open Graph or JSON-LD picture: the main one in full size is
  // `data-old-hires` on the product image, the gallery `"hiRes":"…"` in the page's own script.
  for (const m of html.matchAll(/\bdata-old-hires\s*=\s*["'](https?:[^"']+)["']/gi)) hires.push(m[1])
  for (const m of html.matchAll(/"hiRes"\s*:\s*"(https?:[^"]+)"/g)) hires.push(m[1].replace(/\\\//g, '/'))
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of [...og, ...ld, ...hires, ...twitter, ...other]) {
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

/** UN/CEFACT unit codes schema.org uses in QuantitativeValue. */
const UNIT_CODES: Record<string, string> = { CMT: 'cm', MMT: 'mm', MTR: 'm', KGM: 'kg', GRM: 'g', LTR: 'l', INH: 'inch' }

/** Text of a schema.org value: a string or number, `{ name }`, or the first of a list. */
function ldText(v: any): string {
  if (Array.isArray(v)) return v.length ? ldText(v[0]) : ''
  if (typeof v === 'string' || typeof v === 'number') return decodeEntities(stripTags(String(v)))
  if (v && typeof v === 'object') return ldText(v.name ?? v['@value'] ?? '')
  return ''
}

/** A QuantitativeValue (`{ value, unitCode }`) or a plain "60 cm" as a spec. */
function ldQuantity(name: string, v: any): { name: string; value: string; unit?: string } | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'object' && !Array.isArray(v)) {
    const value = ldText(v.value)
    if (!value) return null
    const unit = UNIT_CODES[String(v.unitCode ?? '').toUpperCase()] ?? ldText(v.unitText)
    return { name, value, ...(unit ? { unit } : {}) }
  }
  const value = ldText(v)
  return value ? { name, value } : null
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ')

function ldFacts(node: any, raw: Record<string, any>, depth = 0): void {
  if (!node || depth > 8 || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const n of node) ldFacts(n, raw, depth + 1)
    return
  }
  const type = ([] as unknown[]).concat(node['@type'] || []).map(String)
  if (type.some((t) => /product/i.test(t))) {
    raw.sku ??= typeof node.sku === 'string' || typeof node.sku === 'number' ? String(node.sku) : undefined
    raw.gtin ??= GTIN_KEYS.map((k) => node[k]).find((v) => v !== undefined)
    raw.mpn ??= node.mpn
    for (const offer of ([] as any[]).concat(node.offers || [])) {
      if (raw.price !== undefined || !offer || typeof offer !== 'object') continue
      if (String(offer.priceCurrency ?? '').toUpperCase() === 'EUR') raw.price = offer.price ?? offer.lowPrice
    }
    for (const key of ['name', 'brand', 'category', 'color', 'description'] as const) {
      const t = ldText(node[key])
      if (t && raw[key] === undefined) raw[key] = t
    }
    const specs: any[] = (raw.specs ??= [])
    for (const [key, label] of [
      ['width', 'Width'],
      ['height', 'Height'],
      ['depth', 'Depth'],
      ['weight', 'Weight'],
    ] as const) {
      const q = ldQuantity(label, node[key])
      if (q) specs.push(q)
    }
    const material = ldText(node.material)
    if (material) specs.push({ name: 'Material', value: material })
    for (const p of ([] as any[]).concat(node.additionalProperty || [])) {
      if (!p || typeof p !== 'object') continue
      const q = ldQuantity(ldText(p.name), p)
      if (q && q.name) specs.push(q)
    }
  }
  if (type.some((t) => /^breadcrumblist$/i.test(t)) && Array.isArray(node.itemListElement)) {
    raw.crumbs ??= [...node.itemListElement]
      .sort((x: any, y: any) => Number(x?.position ?? 0) - Number(y?.position ?? 0))
      .map((x: any) => ldText(x?.name ?? x?.item?.name ?? ''))
      .filter(Boolean)
  }
  // A BuyAction's object is the product (MediaMarkt). Of a ProductGroup's variants only the one
  // the group stands for (same SKU) counts; the other colours must not lend it theirs.
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'object']) if (node[key]) ldFacts(node[key], raw, depth + 1)
  if (node.hasVariant) {
    const variants = ([] as any[]).concat(node.hasVariant)
    const own = node.sku !== undefined ? variants.filter((v) => v && String(v.sku) === String(node.sku)) : []
    ldFacts(own.length ? own : variants, raw, depth + 1)
  }
}

/**
 * The data sheet that MediaMarkt and Saturn keep in their page's preloaded state (Apollo cache):
 * the feature groups of the product with this SKU, each feature a name, value and unit. The
 * cache also holds accessories and recommendations, so only the features this product's groups
 * point to are read.
 */
export function apolloFeatures(html: string, sku: string | undefined): { name: string; value: string; unit?: string }[] {
  if (!sku) return []
  const m = html.match(/<script>window\.__PRELOADED_STATE__\s*=\s*([\s\S]*?);?\s*<\/script>/)
  if (!m) return []
  let state: any
  try {
    state = JSON.parse(m[1].replace(/:undefined\b/g, ':null'))
  } catch {
    return []
  }
  const cache = state?.apolloState
  const groups = cache?.[`GraphqlProductFeatureGroups:${sku}`]?.featureGroups
  if (!Array.isArray(groups)) return []
  const out: { name: string; value: string; unit?: string }[] = []
  for (const group of groups) {
    for (const ref of Array.isArray(group?.features) ? group.features : []) {
      const f = typeof ref?.__ref === 'string' ? cache[ref.__ref] : ref
      const name = typeof f?.name === 'string' ? f.name.trim() : ''
      const value = typeof f?.value === 'string' || typeof f?.value === 'number' ? String(f.value).trim() : ''
      if (!name || !value || out.some((o) => o.name === name)) continue
      out.push({ name, value, ...(typeof f.unit === 'string' && f.unit ? { unit: f.unit } : {}) })
    }
  }
  return out
}

/**
 * Label – value pairs of data-sheet tables (`<th>/<td>` or two cells) and definition lists.
 * A value given as a list ("H/B/T ca. 198/66/39 cm", "Fach links: H/B/T ca. 48/18/34 cm") counts
 * with its first item; further items of the form "Label: value" become lines of their own.
 * Long values are cut at a word rather than dropped.
 */
export function tableSpecs(html: string): { name: string; value: string; table: true }[] {
  const out: { name: string; value: string; table: true }[] = []
  const text = (s: string) => decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim()
  const cut = (v: string) => (v.length <= 200 ? v : `${v.slice(0, v.lastIndexOf(' ', 197))} …`)
  const push = (name: string, value: string) => {
    const n = text(name).replace(/:$/, '')
    const v = cut(text(value))
    // Unrendered templates ("${ item.id }"), header rows ("Eigenschaft | Wert") are not data.
    if (/\$\{|\{\{/.test(n + v) || /^(wert|value|werte|values|beschreibung|description)$/i.test(v)) return
    if (n && v && n.length <= 80 && out.length < 120) out.push({ name: n, value: v, table: true })
  }
  const pair = (name: string, value: string) => {
    const items = [...value.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1])
    if (items.length < 2) return push(name, value)
    push(name, items[0])
    for (const item of items.slice(1)) {
      const m = text(item).match(/^([^:]{1,60}):\s*(.+)$/)
      if (m) push(m[1], m[2])
    }
  }
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => c[2])
    if (cells.length === 2) pair(cells[0], cells[1])
  }
  for (const m of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) pair(m[1], m[2])
  return out
}

/** "Arvika | Shop GmbH" or "Arvika - Shop" (site name from og:site_name) → "Arvika". */
export function stripSiteName(title: string, site?: string): string {
  let t = decodeEntities(title).trim()
  if (site) {
    const s = decodeEntities(site).trim().toLowerCase()
    for (const sep of [' | ', ' - ', ' – ', ' · ']) if (s && t.toLowerCase().endsWith(`${sep}${s}`)) t = t.slice(0, -(sep.length + s.length)).trim()
  }
  // "Galaxy A57 bei MediaMarkt kaufen": the shop named with "bei"/"at", with or without "kaufen".
  if (site) {
    const s = decodeEntities(site)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (s) t = t.replace(new RegExp(`\\s+(bei|at|von)\\s+${s}(\\s+(kaufen|bestellen|shoppen))?$`, 'i'), '').trim()
  }
  // A pipe almost never belongs to a product name; what follows it is the shop.
  const pipe = t.indexOf(' | ')
  if (pipe > 0) t = t.slice(0, pipe).trim()
  // Search-engine tails: "… günstig online kaufen", "… jetzt bestellen".
  return t.replace(/\s+(jetzt\s+)?(günstig\s+)?(online\s+)?(kaufen|bestellen|shoppen)(\s+bei\s+.*)?$/i, '').trim()
}

/**
 * Microdata written on visible elements (`<span itemprop="brand">Nordhaus</span>`), read only
 * inside the part of the page that declares itself a Product – breadcrumbs carry "name" too.
 */
function microdataText(html: string): Record<string, string> {
  const start = html.search(/itemtype=["']https?:\/\/schema\.org\/Product["']/i)
  if (start < 0) return {}
  const scope = html.slice(start, start + 400_000)
  const out: Record<string, string> = {}
  for (const m of scope.matchAll(/<(\w+)\b[^>]*\bitemprop=["'](\w+)["'][^>]*>([\s\S]{0,2000}?)<\/\1>/gi)) {
    const key = m[2].toLowerCase()
    // A machine value in `content` ("1234.50") wins over the shown text ("1.234,50 €").
    const content = attrs(m[0].slice(0, m[0].indexOf('>') + 1)).content
    const text = (content ?? decodeEntities(stripTags(m[3]))).replace(/\s+/g, ' ').trim()
    if (text && !(key in out)) out[key] = text
  }
  return out
}

/**
 * The visible text of the page part that declares itself a Product (bounded), for dimensions
 * named in running text. Short descriptions often carry no itemprop of their own. Different
 * values further down (size variants, recommendations) make the dimension contradictory, and
 * a contradictory dimension is left empty (src/domain/page-import.ts).
 */
function productText(html: string): string {
  const start = html.search(/itemtype=["']https?:\/\/schema\.org\/Product["']/i)
  return start < 0 ? '' : decodeEntities(stripTags(html.slice(start, start + 60_000).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' '))).replace(/\s+/g, ' ')
}

/**
 * Dimensions named in running text: "eine Gesamtbreite von 130 cm, eine Höhe von 196 cm".
 * Only a named dimension with one number and a unit counts; "39-43 cm" does not.
 */
export function proseDimensions(text: string): { name: string; value: string; unit: string; table: true }[] {
  const out: { name: string; value: string; unit: string; table: true }[] = []
  const re = /\b(gesamt)?(breite|höhe|hoehe|tiefe|gewicht)\s*(?:von|:|beträgt|betraegt)?\s*(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)\s*(mm|cm|m|kg|g)\b(?!\s*[-–])/gi
  for (const m of text.matchAll(re)) {
    const name = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()
    // Every mention counts (also repeated ones): differing values must show as a contradiction.
    if (!out.some((s) => s.name === name && s.value === m[3])) out.push({ name, value: m[3], unit: m[4].toLowerCase(), table: true })
  }
  return out
}

/**
 * What a page states about its product: JSON-LD first, then microdata and Open Graph, the
 * breadcrumb as the kind of product, and data-sheet tables. Only well-formed values survive.
 */
export function extractProductFacts(html: string): ProductFacts {
  const raw: Record<string, any> = {}
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ldFacts(JSON.parse(m[1].trim()), raw)
    } catch {
      /* broken JSON-LD is common; ignore */
    }
  }
  const meta: Record<string, string> = {}
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0])
    const key = (a.itemprop || a.property || a.name || '').toLowerCase()
    if (key && a.content && !(key in meta)) meta[key] = a.content
  }
  const micro = microdataText(html)
  for (const [k, v] of Object.entries(micro)) if (!(k in meta)) meta[k] = v
  raw.gtin ??= GTIN_KEYS.map((k) => meta[k]).find((v) => v !== undefined)
  raw.mpn ??= meta.mpn
  if (raw.price === undefined && (meta.pricecurrency ?? meta['product:price:currency'] ?? '').toUpperCase() === 'EUR')
    raw.price = meta.price ?? meta['product:price:amount']
  // Amazon: the price of the buy box, in the data the page keeps for it (euros only).
  const buybox = html.match(/"desktop_buybox_group_1"\s*:\s*\[\s*\{[^{}]*?"priceAmount"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"currencySymbol"\s*:\s*"€"/)
  if (raw.price === undefined && buybox) raw.price = Number(buybox[1])
  // Amazon: the title shown above the product (its pages have no og:title).
  const shownTitle = html.match(/<span\b[^>]*\bid=["']productTitle["'][^>]*>([\s\S]{1,1000}?)<\/span>/i)
  if (shownTitle) raw.name ??= decodeEntities(stripTags(shownTitle[1])).replace(/\s+/g, ' ').trim() || undefined
  // The page title before a generic itemprop "name" (often a breadcrumb step such as "Startseite"),
  // without the shop's name appended ("Regal Arvika | Shop GmbH").
  raw.name ??= stripSiteName(meta['og:title'] ?? meta.name ?? '', meta['og:site_name'])
  // "Hersteller: Nordhaus" → "Nordhaus"
  raw.brand ??= (meta.brand ?? meta['product:brand'] ?? meta['og:brand'])?.replace(/^(hersteller|marke|brand|manufacturer)\s*:\s*/i, '')
  raw.color ??= meta.color ?? meta['product:color']
  raw.description ??= meta.description ?? meta['og:description']
  // The breadcrumb's last step that is not the product itself names its kind ("Kleiderschränke").
  const crumbs: string[] = raw.crumbs ?? []
  const own = String(raw.name ?? '').toLowerCase()
  raw.category ??= meta.category ?? meta['product:category'] ?? [...crumbs].reverse().find((c) => c.toLowerCase() !== own && !own.startsWith(c.toLowerCase()))
  const table = tableSpecs(html)
  // A data sheet that names the brand or the GTIN ("Marke", "Global Trade Identification
  // Number", as Amazon's does) fills them when nothing better stated them.
  const sheet = (re: RegExp) => table.find((t) => re.test(t.name))?.value
  raw.brand ??= sheet(/^(marke|brand)$/i) ?? sheet(/^(hersteller|manufacturer)$/i)
  raw.gtin ??= sheet(/^(ean|gtin|ean[- ]?code|global trade identification number)$/i)?.split(/[\s,;]+/)[0]
  raw.specs = [
    ...(raw.specs ?? []),
    ...apolloFeatures(html, raw.sku),
    ...table,
    ...proseDimensions(`${stripTags(String(raw.description ?? ''))} ${productText(html)}`),
  ]
  return cleanFacts(raw)
}

const isImage = (type: string) => type.startsWith('image/') && !type.includes('svg')

export interface FetchOptions {
  userAgent?: string
  allowPrivate?: boolean
  timeoutMs?: number
}

/**
 * Page text in its declared encoding (header, then `<meta charset>`), UTF-8 otherwise. Shops
 * still serve ISO-8859-1; read as UTF-8 their umlauts become "�".
 */
export function decodeHtml(body: Buffer, contentType: string): string {
  const head = body.subarray(0, 4096).toString('latin1')
  const declared = contentType.match(/charset=["']?([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(declared.toLowerCase()).decode(body)
  } catch {
    return new TextDecoder('utf-8').decode(body)
  }
}

/**
 * Only the HTML of a product page, through the same guarded client (for checks such as
 * scripts/check-shop-pages.ts). Same limits, same refusal of bot walls.
 */
export async function fetchProductPage(url: string, opts: FetchOptions = {}): Promise<string> {
  const allowPrivate = !!opts.allowPrivate
  checkUrl(url, allowPrivate)
  const page = await get(url, {
    accept: 'text/html,application/xhtml+xml',
    maxBytes: MAX_HTML,
    userAgent: opts.userAgent || 'Mozilla/5.0 (compatible; Propario; product image preview)',
    allowPrivate,
    deadline: Date.now() + (opts.timeoutMs || TIMEOUT_MS),
  })
  if (page.status >= 400) throw statusError(page.status)
  if (!page.type.includes('html')) throw new ImageFetchError('no-image', 422)
  const html = decodeHtml(page.body, page.type)
  if (isChallengePage(html) && !extractImageCandidates(html, page.url).length && !Object.keys(extractProductFacts(html)).length)
    throw new ImageFetchError('blocked', 422)
  return html
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

  const html = decodeHtml(page.body, page.type)
  const gallery = extractImageCandidates(html, page.url)
  const facts = { ...extractProductFacts(html), ...(gallery.length > 1 ? { images: gallery.slice(0, 10) } : {}) }
  const candidates = gallery.slice(0, 3)
  // Nothing of a product, and a bot check: the shop refuses us, it is not a page without a picture.
  if (!candidates.length && !Object.keys(facts).length && isChallengePage(html)) throw new ImageFetchError('blocked', 422)
  const noImage = () => Object.assign(new ImageFetchError('no-image', 422), { facts })
  if (!candidates.length) throw noImage()
  let lastError: ImageFetchError = noImage()
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
  lastError.facts = facts
  throw lastError
}
