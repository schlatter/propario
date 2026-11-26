/**
 * Products from a table into an existing comparison: rows that are already there update their
 * product, the others are added. Works for any table ./excel.ts or ./table-text.ts reads – an
 * Excel sheet, a CSV file, or an AI's answer to "Copy for my AI". Pure: it plans, the page shows
 * the plan, src/db/repo.ts `mergeProducts` applies the part the person keeps.
 *
 * Rules:
 * - A row is the same product when its link is the same (ignoring tracking parameters), else
 *   its GTIN, else its name (brand and model).
 * - Columns go to the product's own fields, to the comparison's field of the same name or
 *   meaning ("Breite (mm)" into "Breite (cm)", converted), or else to a new field.
 * - An empty cell never clears anything. Longer texts (comments, pros …) are added to, not
 *   replaced; the link of a product stays its identity and is only filled when empty.
 */
import { makeProduct } from '../db/factories'
import type { Product, PropertyDef, PropertyType, PropertyValue, Requirement } from '../db/types'
import { productName } from '../domain/display'
import { sameLink, withoutTracking } from '../domain/links'
import { hostOf } from '../domain/values'
import { convert, meaning } from '../domain/page-import'
import { analyzeSheet, productRows, rowToProduct, type ColumnMapping, type DraftRequirement, type Grid } from './excel'
import { norm, splitUnit } from './normalize'

export interface MergeColumn {
  header: string
  /** A product field (`price`, `brand` …), an existing field, a new field, or not used. */
  kind: 'builtin' | 'field' | 'new' | 'ignore'
  /** The product field key, the field's id, or the new field's key. */
  target: string
}

export interface NewField {
  key: string
  name: string
  type: PropertyType
  unit: string
  options: string[]
}

export interface MergeChange {
  /** A product field key, or `values` with `field` set (an existing field's id or a new field's key). */
  key: keyof Product
  field?: string
  from: unknown
  to: unknown
}

export interface MergeItem {
  kind: 'new' | 'update' | 'same'
  /** The product as the row describes it; for new products this is what gets added. */
  incoming: Product
  existing: Product | null
  /** For updates: the changes, ready for `updateProduct` (values only with the changed keys). */
  patch: Partial<Product>
  changes: MergeChange[]
}

export interface MergePlan {
  columns: MergeColumn[]
  newFields: NewField[]
  items: MergeItem[]
}

/** Product fields a table can change, in the order they are shown. */
const COMPARED = [
  'brand',
  'model',
  'productType',
  'variant',
  'price',
  'priceNote',
  'gtin',
  'mpn',
  'retailer',
  'url',
  'imageUrl',
  'candidate',
  'favoriteRank',
  'exclusionReason',
  'description',
  'overall',
  'pros',
  'cons',
  'comments',
] as const satisfies (keyof Product)[]
/** Texts that grow: what a table adds is appended, nothing written before is lost. */
const APPENDED = new Set<keyof Product>(['description', 'comments', 'overall', 'pros', 'cons', 'exclusionReason'])

const NEW_KEY = 'new:'
const blank = makeProduct('')
const isEmpty = (v: unknown) => v === undefined || v === null || v === ''
const same = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : typeof a === 'string' && typeof b === 'string' ? a.trim() === b.trim() : a === b

/** The first table in `grids` that has products, planned against the comparison; null if none has. */
export function planMerge(grids: Grid[], products: Product[], properties: PropertyDef[]): MergePlan | null {
  for (const grid of grids) {
    const draft = analyzeSheet('import', grid, { people: [] })
    if (draft.kind !== 'products' || !draft.productRowCount) continue
    return plan(grid, draft.columns, draft, products, properties)
  }
  return null
}

/**
 * The requirements of the first requirement table in `grids` (columns such as Priority,
 * Requirement, Rule, Details, as an AI answers the start request), without those the comparison
 * already has in the same words. Their checks are resolved when they are added.
 */
export function planRequirements(grids: Grid[], existing: Pick<Requirement, 'label'>[]): DraftRequirement[] {
  const have = new Set(existing.map((r) => norm(r.label)))
  for (const grid of grids) {
    const draft = analyzeSheet('import', grid, { people: [] })
    if (draft.kind !== 'requirements') continue
    const seen = new Set<string>()
    return (
      draft.requirements
        .filter((r) => {
          const key = norm(r.label)
          if (!key || have.has(key) || seen.has(key)) return false
          seen.add(key)
          return true
        })
        // "Packed length (cm) = 3": a number that must be met exactly is almost always a slip (an AI
        // mixing up rows); such a requirement is kept, checked by hand.
        .map((r) =>
          r.condition && typeof r.condition.value === 'number' && (r.condition.op === 'eq' || r.condition.op === 'neq') ? { ...r, condition: null } : r,
        )
    )
  }
  return []
}

function plan(grid: Grid, mapped: ColumnMapping[], draft: ReturnType<typeof analyzeSheet>, products: Product[], properties: PropertyDef[]): MergePlan {
  const byName = (name: string) => properties.find((p) => norm(p.name) === norm(name))
  const byMeaning = (name: string) => properties.find((p) => meaning(p.name) === meaning(name))
  const columns: MergeColumn[] = []
  const newFields: NewField[] = []
  const propIds = new Map<number, string>()
  /** Columns whose numbers need converting into the field's unit. */
  const units = new Map<string, { from: string; to: string }>()

  for (const col of mapped) {
    // A column named exactly like a field of the comparison is that field, even if the name
    // could also mean a product field ("Art", "Bild").
    const exact = byName(col.header)
    if (col.target !== 'property' && !exact) {
      const used = col.target !== 'ignore' && col.target !== 'personNote' && col.target !== 'link'
      columns.push({ header: col.header, kind: used ? 'builtin' : 'ignore', target: col.target })
      if (!used) col.target = col.target === 'link' ? 'link' : 'ignore'
      continue
    }
    col.target = 'property'
    const prop = exact ?? byMeaning(col.propertyName) ?? byMeaning(col.header)
    if (prop) {
      propIds.set(col.index, prop.id)
      col.propertyType = prop.type
      if (prop.type === 'number' && col.unit && prop.unit && norm(col.unit) !== norm(prop.unit)) units.set(prop.id, { from: col.unit, to: prop.unit })
      columns.push({ header: col.header, kind: 'field', target: prop.id })
    } else if (col.samples.length) {
      const key = `${NEW_KEY}${col.index}`
      propIds.set(col.index, key)
      const split = col.propertyType === 'number' ? splitUnit(col.header) : { name: col.propertyName, unit: col.unit }
      newFields.push({ key, name: split.name || col.header, type: col.propertyType, unit: split.unit || col.unit, options: col.options })
      columns.push({ header: col.header, kind: 'new', target: key })
    } else columns.push({ header: col.header, kind: 'ignore', target: '' })
  }

  const targets = new Set(columns.filter((c) => c.kind === 'builtin').map((c) => c.target))
  const compared = COMPARED.filter((k) => targets.has(k) || (k === 'priceNote' && targets.has('price')) || (k === 'url' && targets.has('model')))
  const taken = new Set<string>()
  const items: MergeItem[] = []

  for (const r of productRows(grid, draft)) {
    const incoming = rowToProduct(grid[r] ?? [], draft, '', propIds)
    for (const [id, u] of units) {
      const v = incoming.values[id]
      if (typeof v === 'number') incoming.values[id] = convert(v, u.from, u.to) ?? v
    }
    // A link as Propario keeps it (utm_source=chatgpt.com … dropped), its shop as the retailer.
    if (incoming.url) {
      incoming.url = withoutTracking(incoming.url)
      if (!incoming.retailer) incoming.retailer = hostOf(incoming.url)
    }
    const existing = match(incoming, products, taken)
    if (!existing) {
      items.push({ kind: 'new', incoming, existing: null, patch: {}, changes: [] })
      continue
    }
    taken.add(existing.id)
    const patch: Partial<Product> = {}
    const changes: MergeChange[] = []
    for (const key of compared) {
      const to = incoming[key]
      // Defaults of an empty row ("open", no rank) are no news.
      if (isEmpty(to) || same(to, blank[key])) continue
      const from = existing[key]
      if (same(from, to)) continue
      if (key === 'url' && (existing.url || sameLink(existing.url, String(to)))) continue
      // A price that is now a number makes an old price note obsolete, and the other way round.
      if (key === 'priceNote' && incoming.price !== null && same(incoming.price, existing.price)) continue
      let next = to
      if (APPENDED.has(key) && typeof from === 'string' && from.trim()) {
        if (norm(from).includes(norm(String(to)))) continue
        next = `${from.trim()}\n${String(to).trim()}`
      }
      ;(patch as Record<string, unknown>)[key] = next
      changes.push({ key, from, to: next })
    }
    const values: Record<string, PropertyValue> = {}
    for (const [field, to] of Object.entries(incoming.values)) {
      if (isEmpty(to)) continue
      const from = field.startsWith(NEW_KEY) ? undefined : existing.values?.[field]
      if (same(from, to)) continue
      values[field] = to
      changes.push({ key: 'values', field, from, to })
    }
    if (Object.keys(values).length) patch.values = values
    items.push({ kind: changes.length ? 'update' : 'same', incoming, existing, patch, changes })
  }
  return { columns, newFields, items }
}

const nameKey = (p: Pick<Product, 'brand' | 'model'>) => norm(productName(p, ''))

/** The comparison's product a row describes: same link, else same GTIN, else same name. */
function match(p: Product, products: Product[], taken: Set<string>): Product | null {
  const free = products.filter((x) => !taken.has(x.id))
  if (p.url) {
    const hit = free.find((x) => sameLink(x.url, p.url) || (x.links ?? []).some((l) => sameLink(l, p.url)))
    if (hit) return hit
  }
  if (p.gtin) {
    const hit = free.find((x) => x.gtin === p.gtin)
    if (hit) return hit
  }
  const key = nameKey(p)
  if (!key) return null
  // "Arvika 2" alone still finds "Nordhaus Arvika 2" when the table has no brand.
  return free.find((x) => nameKey(x) === key) ?? (p.brand ? null : (free.find((x) => norm(x.model) === norm(p.model)) ?? null))
}
