import type { Product, PropertyDef, PropertyValue } from '../db/types'
import type { Formatters } from '../i18n'
import type { Messages } from '../i18n/en'
import { hostOf, isTyped } from './values'
import type { FactPlan } from './page-import'
import { DIMENSION_UNIT } from './page-import'

export function productName(p: Pick<Product, 'brand' | 'model'>, fallback: string): string {
  const brand = p.brand.trim()
  const model = p.model.trim()
  // Many sheets repeat the brand in the model ("Miele" + "Miele WDB330").
  if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) return model
  return [brand, model].filter(Boolean).join(' ') || fallback
}

export function avgStars(p: Product): number | null {
  const s = p.ratings.map((r) => r.stars).filter((x): x is number => typeof x === 'number')
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
}

export function formatValue(prop: PropertyDef, v: PropertyValue | undefined, m: Messages, fmt: Formatters): string {
  if (v === null || v === undefined || v === '') return ''
  if (!isTyped(prop, v)) return String(v)
  switch (prop.type) {
    case 'number':
      return `${fmt.number(v as number)}${prop.unit ? ` ${prop.unit}` : ''}`
    case 'boolean':
      return v ? m.common.yes : m.common.no
    case 'date':
      return fmt.date(v as string)
    case 'rating':
      return `${'★'.repeat(v as number)}`
    default:
      return String(v)
  }
}

/** Sort key: numbers sort numerically, everything else alphabetically; empty values always last. */
export function sortKey(v: PropertyValue | undefined): number | string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  return String(v).toLowerCase()
}

export function compareKeys(a: number | string | null, b: number | string | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return String(a).localeCompare(String(b), undefined, { numeric: true }) * dir
}

/** How long an entry counts as new (and gets the blue stripe). */
export const NEW_FOR_DAYS = 3

/** Added within the last NEW_FOR_DAYS days. */
export function isNew(createdAt: string | undefined, now = new Date()): boolean {
  const t = Date.parse(createdAt ?? '')
  return Number.isFinite(t) && now.getTime() - t < NEW_FOR_DAYS * 86_400_000 && t <= now.getTime() + 60_000
}

/** "brand", "Breite" → "Brand, Breite": product field keys in the interface language, field names as they are. */
export function filledLabels(filled: string[], m: Messages): string {
  const fields = m.field as Record<string, string>
  return filled.map((k) => fields[k] ?? k).join(', ')
}

/** "Optik · zu dunkel": the kind of reason and the details, whichever are there. */
export function exclusionText(p: Pick<Product, 'exclusionReason' | 'exclusionCategory'>, m: Messages): string {
  return [p.exclusionCategory ? m.exclusion.categories[p.exclusionCategory] : '', p.exclusionReason].filter(Boolean).join(' · ')
}

/**
 * What an update from the shop page would change, one line each, for asking before it happens:
 * "Price: €989 → €949", "Breite: 66 cm", "3 more data-sheet lines".
 */
export function describePlan(p: Product, plan: FactPlan, properties: PropertyDef[], m: Messages, fmt: Formatters): string[] {
  const fields = m.field as Record<string, string>
  const lines: string[] = []
  for (const [key, to] of Object.entries(plan.patch)) {
    if (key === 'values' || key === 'extra' || key === 'priceDate') continue
    if (key === 'price') lines.push(`${fields.price}: ${p.price !== null && p.price !== undefined ? `${fmt.money(p.price)} → ` : ''}${fmt.money(to as number)}`)
    else if (key === 'description') lines.push(fields.description)
    else lines.push(`${fields[key] ?? key}: ${String(to)}`)
  }
  for (const [id, v] of Object.entries(plan.patch.values ?? {})) {
    const prop = properties.find((x) => x.id === id)
    if (prop) lines.push(`${prop.name}: ${formatValue(prop, v, m, fmt)}`)
  }
  for (const c of plan.create) lines.push(`${m.pageImport[c.dimension]}: ${fmt.number(c.value)} ${DIMENSION_UNIT[c.dimension]} (${m.pageUpdate.newField})`)
  const extras = Object.keys(plan.patch.extra ?? {}).filter((k) => !(k in (p.extra ?? {}))).length
  if (extras) lines.push(m.pageUpdate.extras(extras))
  return lines
}

/** The name to show and announce: brand and model, else the shop's address, else "Unnamed product". */
export const displayName = (p: Pick<Product, 'brand' | 'model' | 'url'>, m: Messages) => productName(p, hostOf(p.url ?? '') || m.product.unnamed)
