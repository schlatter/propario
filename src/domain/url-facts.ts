/**
 * What a shop link says by itself – for pages that refuse automated access (Otto, for one,
 * answers with a bot check). Many shops write the product name and often the dimensions into
 * the address: …/nordhaus-sideboard-mit-led-beleuchtung-…-b140-t42-h85-cm-…-AB12CD34/.
 * Read without any request; it only fills empty fields, like a page would.
 */
import type { ProductFacts } from '../shared/product-facts.ts'

const SMALL = new Set(['mit', 'und', 'in', 'im', 'für', 'fuer', 'aus', 'von', 'zum', 'zur', 'der', 'die', 'das', 'with', 'and', 'for', 'of', 'the'])
/** Where the name ends: a quantity ("1-st"), a dimension ("b120"), a unit, or a long run of keywords. */
const STOP = /^(\d+|st|stk|b\d+|t\d+|h\d+|cm|mm|m)$/
const DIMENSION: Record<string, string> = { b: 'Breite', t: 'Tiefe', h: 'Höhe' }

export function factsFromUrl(url: string): ProductFacts {
  let path: string
  try {
    path = decodeURIComponent(new URL(url).pathname)
  } catch {
    return {}
  }
  // The longest hyphenated part of the path is the readable one.
  const slug = path
    .split('/')
    .filter((s) => (s.match(/-/g) ?? []).length >= 2)
    .sort((a, b) => b.length - a.length)[0]
  if (!slug) return {}
  // A trailing article number ("…-AB12CD34", "…-123456") is not part of the name.
  const words = slug
    .replace(/\.(html?|php|aspx?)$/i, '')
    .replace(/-[A-Z0-9]{6,}$/, '')
    .toLowerCase()
    .split(/[-_]+/)
    .filter(Boolean)

  const facts: ProductFacts = {}
  const end = words.findIndex((w) => STOP.test(w))
  const nameWords = (end < 0 ? words : words.slice(0, end)).slice(0, 12)
  if (nameWords.length >= 2) {
    facts.name = nameWords.map((w, i) => (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ')
  }

  // "b120-t40-h179-cm": width, depth, height in centimetres, in any order, before "cm".
  const cm = words.indexOf('cm')
  if (cm > 0) {
    const specs = words
      .slice(Math.max(0, cm - 3), cm)
      .map((w) => w.match(/^([bth])(\d{1,4})$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ name: DIMENSION[m[1]], value: `${m[2]} cm` }))
    if (specs.length) facts.specs = specs
  }
  return facts
}
