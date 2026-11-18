import type { PropertyDef, PropertyType, PropertyValue } from '../db/types'

const TRUE_WORDS = new Set(['ja', 'yes', 'y', 'true', 'wahr', 'x', '✓', '✔', '1', 'j'])
const FALSE_WORDS = new Set(['nein', 'no', 'n', 'false', 'falsch', '-', '✗', '✘', '0'])

export function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : null
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (TRUE_WORDS.has(s)) return true
  if (FALSE_WORDS.has(s)) return false
  return null
}

/**
 * Reads one number from user or Excel text, German or English notation:
 * "1.234,50 €", "1,234.50", "0,35", "12.5 kg", "424 €". Returns null if the
 * text contains more than one number or other words (e.g. "830 – 900 €").
 */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  let s = raw.trim().replace(/ /g, ' ')
  if (!s) return null
  // Strip a currency or a trailing unit (letters, %, °, ², ³, /, parentheses-free).
  s = s.replace(/^(€|eur|\$|usd|chf)\s*/i, '').replace(/\s*(€|eur|euro|\$|usd|chf)$/i, '')
  s = s.replace(/\s*[a-zA-Zäöüß°%²³µ/]+(\([a-zA-Z]+\))?$/, '')
  s = s.replace(/\s/g, '').replace(/^~/, '')
  if (!/^[-+]?[\d.,']+$/.test(s)) return null
  s = s.replace(/'/g, '')
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ','
    const thou = dec === '.' ? ',' : '.'
    s = s.split(thou).join('').replace(dec, '.')
  } else if (lastComma >= 0) {
    // "1,500" or "1,500,000" = thousands; "0,35" or "12,5" = decimal comma
    s = /^[-+]?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot >= 0 && /^[-+]?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  if ((s.match(/\./g) ?? []).length > 1) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Leading number of a text such as "700 (450)" or "ab 1,7" – used only where a best guess is acceptable. */
export function parseLeadingNumber(raw: string): number | null {
  const m = raw.trim().match(/^(?:ab|ca\.?|~)?\s*([-+]?\d[\d.,']*)/i)
  return m ? parseNumber(m[1]) : null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A price older than this many days is marked as worth checking again. */
export const STALE_DAYS = 7

/** Today in local time, ISO `yyyy-mm-dd`. */
export const todayIso = () => dateToIso(new Date())

/** An ISO date moved by whole days, months or years ('' stays ''). End of month is clamped (31.01. + 1 month = 28./29.02.). */
export function shiftDate(iso: string, { days = 0, months = 0, years = 0 }: { days?: number; months?: number; years?: number }): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const y = +m[1] + years
  const mo = +m[2] - 1 + months
  const last = new Date(y, mo + 1, 0).getDate()
  return dateToIso(new Date(y, mo, Math.min(+m[3], last) + days))
}

/** Whole days between an ISO date and `now` (local calendar days); null when there is no date. */
export function daysSince(iso: string | undefined, now = new Date()): number | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const then = new Date(+m[1], +m[2] - 1, +m[3])
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today.getTime() - then.getTime()) / 86_400_000)
}

/** Excel serial day number → ISO date (1900 date system). */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Accepts ISO, German "dd.mm.yyyy", "dd/mm/yyyy", "dd-mm-yyyy", Date objects and Excel serials. */
export function parseDate(raw: unknown): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) return dateToIso(raw)
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) return excelSerialToIso(raw)
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return valid(y, +m[2], +m[1])
  }
  return null
}

function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}

export function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/|www\.)\S+$/i.test(s.trim())
}

export function normalizeUrl(s: string): string {
  const t = s.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : /^www\./i.test(t) ? `https://${t}` : t
}

/** Only http(s) links are rendered as clickable links (no javascript: etc.). */
export function safeHref(s: string): string | null {
  const t = normalizeUrl(s)
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Converts input for a property of the given type. Returns `{ ok: false }`
 * when the text does not fit; callers then keep the raw text instead of losing it.
 */
export function coerceValue(type: PropertyType, raw: unknown): { ok: boolean; value: PropertyValue } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null }
  switch (type) {
    case 'number': {
      const n = parseNumber(raw)
      return n === null ? { ok: false, value: String(raw) } : { ok: true, value: n }
    }
    case 'rating': {
      const n = parseNumber(raw)
      return n !== null && n >= 0 && n <= 5 ? { ok: true, value: Math.round(n) } : { ok: false, value: String(raw) }
    }
    case 'boolean': {
      const b = parseBoolean(raw)
      return b === null ? { ok: false, value: String(raw) } : { ok: true, value: b }
    }
    case 'date': {
      const d = parseDate(raw)
      return d === null ? { ok: false, value: String(raw) } : { ok: true, value: d }
    }
    case 'url':
      return { ok: true, value: normalizeUrl(String(raw)) }
    default:
      return { ok: true, value: raw instanceof Date ? dateToIso(raw) : String(raw) }
  }
}

/** True when a stored value matches the property's type (otherwise it is shown as raw text). */
export function isTyped(prop: PropertyDef, v: PropertyValue): boolean {
  if (v === null) return true
  switch (prop.type) {
    case 'number':
    case 'rating':
      return typeof v === 'number'
    case 'boolean':
      return typeof v === 'boolean'
    case 'date':
      return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    default:
      return true
  }
}
