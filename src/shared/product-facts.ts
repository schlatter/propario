/**
 * Facts a shop page states about its product (schema.org / microdata): its GTIN (EAN), the
 * manufacturer part number and the offered price. Read on the server during the one page read
 * that fetches the picture, checked again in the browser – the page is untrusted input.
 */

export interface ProductFacts {
  gtin?: string
  mpn?: string
  /** Price in euros; other currencies are dropped because Propario shows euros. */
  price?: number
}

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
  return out
}
