/** Text helpers shared by the importer. */

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ /g, ' ')
    .replace(/[_/|:;,.!?"'„“”()[\]{}+*–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const UNIT_RE = /^(cm|mm|m|km|kg|g|l|ml|liter|€|eur|euro|w|kw|v|ah|mah|wh|h|min|db|db\(a\)|dba|zoll|"|inch|gb|tb|mb|hz|ghz|mhz|kwh\/a|kwh|lm|%|m²|qm|ps|°c|°)$/i

export function isUnit(s: string): boolean {
  return UNIT_RE.test(s.trim())
}

/**
 * Splits a header into name and unit: "Breite (cm)" → ["Breite", "cm"],
 * "Gewicht kg" → ["Gewicht", "kg"], "Preis (€)" → ["Preis", "€"].
 */
export function splitUnit(header: string): { name: string; unit: string } {
  const h = header.trim()
  let m = h.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m && isUnit(m[2])) return { name: m[1].trim(), unit: m[2].trim() }
  m = h.match(/^(.*\S)\s+(\S+)$/)
  if (m && isUnit(m[2])) return { name: m[1].trim(), unit: m[2].trim() }
  m = h.match(/^(.*?)\s+in\s+(\S+)$/i)
  if (m && isUnit(m[2])) return { name: m[1].trim(), unit: m[2].trim() }
  return { name: h, unit: '' }
}

/** Tokens of a name without units, for fuzzy matching of requirement labels to properties. */
export function nameTokens(s: string): string[] {
  const { name } = splitUnit(s)
  return norm(name)
    .split(' ')
    .filter((t) => t && !STOP.has(t) && !isUnit(t) && !/^\d+$/.test(t))
}

const STOP = new Set([
  'max',
  'maximal',
  'maximale',
  'maximaler',
  'maximales',
  'maximum',
  'höchstens',
  'hoechstens',
  'min',
  'minimal',
  'minimale',
  'minimaler',
  'minimum',
  'mindestens',
  'mind',
  'bevorzugte',
  'bevorzugter',
  'bevorzugt',
  'gewünschte',
  'ideal',
  'ideale',
  'idealer',
  'die',
  'der',
  'das',
  'des',
  'ein',
  'eine',
  'von',
  'bis',
  'mit',
  'und',
  'oder',
  'ca',
  'the',
  'a',
  'an',
  'of',
  'at',
  'most',
  'least',
  'preferred',
  'up',
  'to',
])

/** Optional category suggestion for imported sheets (only a default; editable in the wizard). */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/notebook|laptop|monitor|tablet|smartphone|handy|drucker|router|smartwatch|ebook|streaming|walkie/i, 'Elektronik'],
  [/tv|fernseh|soundbar|subwoofer|receiver|5\.1|bluetooth|kopfhörer|audio|lautsprecher/i, 'Audio & TV'],
  [/fahrrad|ebike|e-bike|helm|schloss/i, 'Fahrrad'],
  [/camping|isomatte|schlafsack|zelt|rucksack|outdoor|kühltasche/i, 'Camping & Outdoor'],
  [/wasch|kühl|staubsaug|bügel|küche|herd|ofen|spül|haarschneider|massage|bohrer|akku/i, 'Haushalt & Geräte'],
  [/schrank|schränk|tisch|bett|matratze|möbel|regal|sofa|stuhl|lampe|licht|boxen|weihnachtsbaum/i, 'Möbel & Einrichtung'],
  [/auto|kindersitz|leasing/i, 'Auto'],
  [/kaninchen|hamster|haustier|transportbox|stall/i, 'Haustiere'],
]

export function suggestCategory(name: string): string {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(name)) return cat
  return ''
}

/** Words that make a requirement a limit: "max. 40 cm" is at most, "mindestens 4" at least. */
export const LTE = /(^|\s)(max|maximal\w*|höchstens|bis|unter|kleiner|weniger|at most|up to|below|under|≤)(\s|\.|:|$)/i
export const GTE = /(^|\s)(min|mind|minimal\w*|mindestens|ab|über|größer|mehr als|at least|above|over|≥)(\s|\.|:|$)/i

/**
 * A number field a requirement asks about, read from its words: "Maximale Tiefe 40 cm" →
 * field "Tiefe" in cm, rule ≤ 40. Only the name is sure; unit, direction and limit are taken
 * when the text states them.
 */
export function fieldFromRequirement(label: string, description = ''): { name: string; unit: string; op?: 'lte' | 'gte'; value?: number } {
  const tokens = nameTokens(label)
  const name = tokens.length ? tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ') : label.trim()
  const text = `${label} ${description}`
  const op = LTE.test(label) || (!GTE.test(label) && LTE.test(description)) ? 'lte' : GTE.test(text) ? 'gte' : undefined
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm|m|kg|g|l|w|kw|zoll|db)?(?![\w])/i)
  const value = m ? Number(m[1].replace(',', '.')) : undefined
  return { name, unit: (m?.[2] ?? '').toLowerCase(), ...(op ? { op } : {}), ...(value !== undefined && Number.isFinite(value) ? { value } : {}) }
}
