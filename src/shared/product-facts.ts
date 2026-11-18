/**
 * Facts a shop page states about its product (schema.org / microdata): its GTIN (EAN), the
 * manufacturer part number and the offered price. Read on the server during the one page read
 * that fetches the picture, checked again in the browser – the page is untrusted input.
 */

/** One line of a shop's data sheet ("Breite" – "60" – "cm"). */
export interface Spec {
  name: string
  value: string
  unit?: string
  /** Read from an HTML table rather than the page's structured data: less certain, used only where it fits a field. */
  table?: boolean
}

export interface ProductFacts {
  gtin?: string
  mpn?: string
  /** Price in euros; other currencies are dropped because Propario shows euros. */
  price?: number
  name?: string
  brand?: string
  /** What kind of product: schema.org category or the page's breadcrumb. */
  category?: string
  color?: string
  description?: string
  specs?: Spec[]
}

/** Limits for text from a page: generous for real data, small enough to keep records and headers lean. */
export const FACT_LIMITS = { name: 200, brand: 100, category: 100, color: 60, description: 1000, specs: 60, specName: 80, specValue: 200, unit: 20 }

/** GTIN-8/12/13/14 with a valid check digit (EAN-13 is GTIN-13). */
export function isValidGtin(s: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(s)) return false
  const digits = [...s].map(Number)
  const check = digits.pop()!
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/** Digits only (at most 14), however people type or paste them ("4 006381-333931"). */
export const normalizeGtin = (s: string) => s.replace(/\D/g, '').slice(0, 14)

const MPN = /^[\p{L}\p{N}][\p{L}\p{N} ._\-/+#]{0,63}$/u

/** Plain single-line text: control characters and runs of whitespace collapse to one space. */
function plain(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return ''
  const t = String(v)
    .replace(/[\u0000-\u001f\u007f\s]+/g, ' ')
    .trim()
  return t.length <= max ? t : ''
}

/** Keeps only well-formed facts; anything else is dropped, never repaired. */
export function cleanFacts(raw: unknown): ProductFacts {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: ProductFacts = {}
  const gtin = typeof r.gtin === 'string' || typeof r.gtin === 'number' ? String(r.gtin).replace(/[\s-]/g, '') : ''
  if (isValidGtin(gtin)) out.gtin = gtin
  const mpn = typeof r.mpn === 'string' ? r.mpn.trim() : ''
  if (MPN.test(mpn)) out.mpn = mpn
  const price = typeof r.price === 'number' ? r.price : typeof r.price === 'string' && /^\d+(\.\d{1,2})?$/.test(r.price.trim()) ? Number(r.price) : NaN
  if (Number.isFinite(price) && price > 0 && price < 10_000_000) out.price = Math.round(price * 100) / 100
  for (const key of ['name', 'brand', 'category', 'color'] as const) {
    const t = plain(r[key], FACT_LIMITS[key])
    // Some shops put the dimensions into the colour ("B 131 cm/ H 190 cm").
    if (key === 'color' && /\d\s*(mm|cm|m)\b/i.test(t)) continue
    if (t) out[key] = t
  }
  // A description may be longer than allowed; it is cut at a word, not dropped.
  if (typeof r.description === 'string') {
    const d = plain(r.description.slice(0, FACT_LIMITS.description * 2), FACT_LIMITS.description * 2)
    const cut = d.length > FACT_LIMITS.description ? `${d.slice(0, d.lastIndexOf(' ', FACT_LIMITS.description - 1))} …` : d
    if (cut) out.description = cut
  }
  if (Array.isArray(r.specs)) {
    const specs: Spec[] = []
    for (const x of r.specs.slice(0, FACT_LIMITS.specs * 2)) {
      if (!x || typeof x !== 'object') continue
      const o = x as Record<string, unknown>
      const name = plain(o.name, FACT_LIMITS.specName)
      const value = plain(o.value, FACT_LIMITS.specValue)
      if (!name || !value) continue
      const unit = plain(o.unit, FACT_LIMITS.unit)
      specs.push({ name, value, ...(unit ? { unit } : {}), ...(o.table === true ? { table: true } : {}) })
      if (specs.length === FACT_LIMITS.specs) break
    }
    if (specs.length) out.specs = specs
  }
  return out
}
