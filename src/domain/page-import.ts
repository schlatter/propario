/**
 * What to take from a shop page into a product. Pure: given the product, the page's facts and
 * the comparison's fields, it returns the changes; src/db/repo.ts applies them.
 *
 * Rules, in order of importance:
 * - Only empty fields are filled; nothing someone entered is ever overwritten.
 * - A data-sheet line goes into the comparison's field of the same meaning ("Breite (cm)" takes
 *   "Width: 600 mm" as 60). Units are converted only between mm/cm/m and g/kg; anything else
 *   that does not fit is left out rather than guessed.
 * - Width, height, depth and weight get their own field when the comparison has none yet –
 *   they are what products are most often compared by.
 * - Other lines from the page's structured data are kept under "Imported extras", never lost;
 *   lines read from HTML tables only count where they fit a field (tables also hold shipping
 *   costs, size charts and the like).
 */
import type { Product, PropertyDef, PropertyValue } from '../db/types'
import { norm, splitUnit } from '../import/normalize'
import type { ProductFacts, Spec } from '../shared/product-facts.ts'
import { coerceValue, parseNumber } from './values'

export type Dimension = 'width' | 'height' | 'depth' | 'weight'
type Group = Dimension | 'color' | 'material'

/** Names that mean the same, after `norm` and without a unit. */
const GROUPS: Record<Group, string[]> = {
  width: ['breite', 'width', 'b', 'gesamtbreite', 'außenbreite', 'aussenbreite', 'artikelbreite', 'produktbreite'],
  height: ['höhe', 'hoehe', 'height', 'h', 'gesamthöhe', 'gesamthoehe', 'außenhöhe', 'aussenhoehe', 'artikelhöhe', 'produkthöhe'],
  depth: ['tiefe', 'depth', 't', 'd', 'gesamttiefe', 'außentiefe', 'aussentiefe', 'artikeltiefe', 'produkttiefe'],
  weight: ['gewicht', 'weight', 'nettogewicht', 'net weight', 'artikelgewicht', 'produktgewicht', 'eigengewicht', 'gewicht netto'],
  color: ['farbe', 'color', 'colour', 'farbton', 'hauptfarbe', 'farbe laut hersteller', 'herstellerfarbe'],
  material: ['material', 'materialien', 'hauptmaterial', 'werkstoff'],
}
const DIMENSIONS: Dimension[] = ['width', 'height', 'depth', 'weight']
export const DIMENSION_UNIT: Record<Dimension, string> = { width: 'cm', height: 'cm', depth: 'cm', weight: 'kg' }

/** A name's meaning: its group, or the plain normalised name. */
export function meaning(name: string): string {
  const n = norm(splitUnit(name).name)
  for (const [g, names] of Object.entries(GROUPS)) if (names.includes(n)) return g
  return n
}

const LENGTH: Record<string, number> = { mm: 0.1, cm: 1, m: 100 }
const MASS: Record<string, number> = { g: 0.001, kg: 1 }

/** Converts between mm/cm/m or g/kg; null when the units do not belong together. */
export function convert(n: number, from: string, to: string): number | null {
  const f = from.toLowerCase()
  const t = to.toLowerCase()
  if (f === t) return n
  const table = f in LENGTH && t in LENGTH ? LENGTH : f in MASS && t in MASS ? MASS : null
  return table ? Math.round(((n * table[f]) / table[t]) * 1000) / 1000 : null
}

/** "60,5 cm" → { n: 60.5, unit: 'cm' }; the spec's own unit wins over one in the text. */
function quantity(spec: Spec): { n: number; unit: string } | null {
  const m = spec.value.match(/^\s*(?:ca\.?\s*)?(\d[\d.,]*)\s*([a-zA-Zµ]+)?\s*$/)
  if (!m) return null
  const n = parseNumber(m[1])
  return n === null ? null : { n, unit: (spec.unit || m[2] || '').toLowerCase() }
}

const LETTER: Record<string, Dimension> = { b: 'width', w: 'width', h: 'height', t: 'depth', d: 'depth' }
const NUM = String.raw`(\d+(?:[.,]\d+)?)`

/**
 * "Maße (B x H x T): 60 x 180 x 55 cm" or "B 60 x H 180 x T 55 cm" → width, height, depth. The
 * order must be stated; an unlabelled "60 x 180 x 55" is not guessed.
 */
export function splitDimensions(spec: Spec): Spec[] {
  const text = `${spec.name} ${spec.value}`
  const unit = (spec.unit || spec.value.match(/(mm|cm|m)\s*$/i)?.[1] || '').toLowerCase()
  if (!unit) return []
  const labelled = [...spec.value.matchAll(new RegExp(String.raw`\b([BHTWD])\s*:?\s*${NUM}`, 'gi'))]
  if (labelled.length >= 2) return labelled.map((m) => ({ name: LETTER[m[1].toLowerCase()], value: m[2], unit })).filter((s) => s.name)
  const order = text.match(/\b([BHTWD])\s*[x×*/]\s*([BHTWD])(?:\s*[x×*/]\s*([BHTWD]))?\b/i)
  const nums = spec.value.match(new RegExp(String.raw`${NUM}\s*(?:${unit})?\s*[x×*]\s*${NUM}(?:\s*(?:${unit})?\s*[x×*]\s*${NUM})?`, 'i'))
  if (!order || !nums) return []
  const letters = order.slice(1).filter(Boolean)
  const values = nums.slice(1).filter(Boolean)
  if (letters.length !== values.length) return []
  return letters.map((l, i) => ({ name: LETTER[l.toLowerCase()], value: values[i], unit })).filter((s) => s.name)
}

const COMBINED = /^(maße|masse|abmessungen|abmessung|dimensions|dimension|größe|groesse|size|maße b x h x t|außenmaße|aussenmasse)$/

export interface FactPlan {
  /** Changes to the product's own fields and values (keyed by existing field id). */
  patch: Partial<Product>
  /** Fields to create, each with the value for this product. */
  create: { dimension: Dimension; value: number }[]
  /** What was taken, for telling the person: product field keys and field names. */
  filled: string[]
}

const empty = (v: PropertyValue | undefined) => v === undefined || v === null || v === ''

export function planFacts(p: Product, facts: ProductFacts, properties: PropertyDef[]): FactPlan {
  const patch: Partial<Product> = {}
  const filled: string[] = []
  const take = <K extends keyof Product>(key: K, value: Product[K] | undefined) => {
    if (value === undefined || value === '' || value === null) return
    const current = p[key]
    if (current !== undefined && current !== null && current !== '') return
    patch[key] = value
    filled.push(key)
  }

  take('gtin', facts.gtin)
  take('mpn', facts.mpn)
  take('price', facts.price)
  take('brand', facts.brand)
  // The model is the page's product name without a leading brand ("Nordhaus Arvika 2" → "Arvika 2").
  const brand = (p.brand || facts.brand || '').trim()
  const model = facts.name && brand && facts.name.toLowerCase().startsWith(`${brand.toLowerCase()} `) ? facts.name.slice(brand.length).trim() : facts.name
  take('model', model)
  take('productType', facts.category)
  take('variant', facts.color)
  take('description', facts.description)

  // Data sheet: combined dimensions split up, colour as a line too (a comparison may have a field for it).
  const specs: Spec[] = []
  for (const s of facts.specs ?? []) {
    specs.push(s)
    if (COMBINED.test(norm(splitUnit(s.name).name)) || /\d\s*[x×]\s*\d/.test(s.value)) specs.push(...splitDimensions(s).map((d) => ({ ...d, table: s.table })))
  }
  if (facts.color) specs.push({ name: 'color', value: facts.color })

  const values: Record<string, PropertyValue> = {}
  const done = new Set<string>() // meanings already served, first line wins
  const created = new Map<Dimension, number>()
  const extra: Record<string, string> = {}
  for (const s of specs) {
    const key = meaning(s.name)
    if (done.has(key)) continue
    const prop = properties.find((x) => meaning(x.name) === key)
    if (prop) {
      done.add(key)
      if (!empty(p.values?.[prop.id])) continue
      const v = valueFor(prop, s)
      if (v !== null) {
        values[prop.id] = v
        filled.push(prop.name)
      }
      continue
    }
    if ((DIMENSIONS as string[]).includes(key)) {
      const q = quantity(s)
      const v = q && convert(q.n, q.unit, DIMENSION_UNIT[key as Dimension])
      if (v !== null && v !== undefined && v > 0) {
        done.add(key)
        created.set(key as Dimension, v)
      }
      continue
    }
    if (!s.table && key !== 'color' && !(s.name in (p.extra ?? {})) && Object.keys(extra).length < 30) {
      done.add(key)
      extra[s.name] = s.unit ? `${s.value} ${s.unit}` : s.value
    }
  }
  if (Object.keys(values).length) patch.values = values
  if (Object.keys(extra).length) patch.extra = { ...(p.extra ?? {}), ...extra }
  return { patch, create: [...created].map(([dimension, value]) => ({ dimension, value })), filled }
}

/** A spec's value for a field, or null when it does not fit without guessing. */
function valueFor(prop: PropertyDef, s: Spec): PropertyValue {
  if (prop.type === 'number') {
    const q = quantity(s)
    if (!q) return null
    if (!prop.unit) return q.unit ? null : q.n
    if (!q.unit) return null
    return convert(q.n, q.unit, prop.unit)
  }
  if (prop.type === 'select') return prop.options.find((o) => o.toLowerCase() === s.value.toLowerCase()) ?? null
  const c = coerceValue(prop.type, s.unit ? `${s.value} ${s.unit}` : s.value)
  return c.ok ? c.value : null
}
