/**
 * A comparison as plain text for one's own AI ("Copy for my AI"): requirements with their
 * priority, the budget, and every product with its price, fields, verdicts, outside ratings and
 * the notes everyone in the comparison sees – with a request: help to decide (the default), more
 * products to look at, or the person's own question. Nothing leaves Propario
 * by itself; the person pastes it where they choose. Names of people are left out: ratings
 * appear as stars only.
 *
 * It ends with the products as a table the AI can answer with: pasted back into "Add or update
 * products" (src/import/merge.ts), its rows update the products they name and add new ones.
 */
import type { Product, Project, PropertyDef, Requirement } from '../db/types'
import type { Formatters } from '../i18n'
import type { Messages } from '../i18n/en'
import { isFavorite, statusOf } from './verdict.ts'
import { displayName, exclusionText, formatValue } from './display.ts'
import { evaluate, OP_SYMBOL, type Summary } from './requirements.ts'
import { reviewSummary } from './reviews.ts'

interface Input {
  project: Project
  products: Product[]
  properties: PropertyDef[]
  rules: Requirement[]
  propMap: Map<string, PropertyDef>
  summaries: Map<string, Summary>
}

export function comparisonForAi(d: Input, m: Messages, fmt: Formatters, request = m.ai.prompt): string {
  const lines: string[] = [`# ${d.project.name}${d.project.category ? ` (${d.project.category})` : ''}`, '', request.trim() || m.ai.prompt, '']
  if (d.project.description) lines.push(d.project.description, '')

  const rule = (r: Requirement) => {
    const c = r.condition
    if (!c) return ''
    const target = c.target.kind === 'price' ? m.field.price : (d.propMap.get(c.target.propertyId)?.name ?? '?')
    return ` – ${target} ${OP_SYMBOL[c.op]}${c.value !== undefined && c.value !== '' ? ` ${c.value}` : ''}`
  }
  if (d.rules.length) {
    lines.push(`## ${m.product.requirements}`)
    for (const r of d.rules) lines.push(`- [${m.priority[r.priority]}] ${r.label}${rule(r)}${r.description ? ` – ${r.description}` : ''}`)
    lines.push('')
  }

  lines.push(`## ${m.ai.products(d.products.length)}`)
  for (const p of d.products) {
    const status =
      p.candidate === 'excluded'
        ? `${m.candidate.excluded}${exclusionText(p, m) ? `: ${exclusionText(p, m)}` : ''}`
        : `${m.candidate[statusOf(p)]}${isFavorite(p) ? `, ${m.verdict.favorite}` : ''}`
    lines.push('', `### ${displayName(p, m)} – ${status}${d.project.decisionProductId === p.id ? ` – ${m.project.decision}` : ''}`)
    const price = p.price !== null ? `${fmt.money(p.price)}${p.priceDate ? ` (${fmt.date(p.priceDate)})` : ''}` : p.priceNote
    if (price) lines.push(`- ${m.field.price}: ${price}${p.retailer ? `, ${p.retailer}` : ''}`)
    if (p.url) lines.push(`- ${m.field.url}: ${p.url}`)
    for (const [label, v] of [
      [m.field.productType, p.productType],
      [m.field.variant, p.variant],
    ] as const)
      if (v) lines.push(`- ${label}: ${v}`)
    const values = d.properties
      .map((prop) => [prop.name, formatValue(prop, p.values?.[prop.id], m, fmt)] as const)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
    if (values.length) lines.push(`- ${m.product.properties}: ${values.join('; ')}`)
    const failed = d.rules.filter((r) => evaluate(r, p, d.propMap) === 'fail').map((r) => r.label)
    const open = d.rules.filter((r) => r.priority !== 'info' && evaluate(r, p, d.propMap) === 'unknown').map((r) => r.label)
    if (failed.length) lines.push(`- ${m.ai.notMet}: ${failed.join(', ')}`)
    if (open.length) lines.push(`- ${m.ai.unknown}: ${open.join(', ')}`)
    const s = d.summaries.get(p.id)
    if (s?.fit !== null && s?.fit !== undefined) lines.push(`- ${m.check.fit}: ${s.fit} %`)
    const reviews = reviewSummary(p.reviews, 'product')
    if (reviews.sources) lines.push(`- ${m.review.column}: ${reviews.score}/100 (${m.review.sources(reviews.sources)})`)
    const stars = p.ratings.map((r) => r.stars).filter((x): x is number => x !== null)
    if (stars.length) lines.push(`- ${m.field.ratings}: ${stars.map((x) => `${x}/5`).join(', ')}`)
    for (const [label, v] of [
      [m.field.pros, p.pros],
      [m.field.cons, p.cons],
      [m.field.overall, p.overall],
      [m.field.comments, p.comments],
    ] as const)
      if (v.trim()) lines.push(`- ${label}: ${v.trim().replace(/\s*\n\s*/g, ' / ')}`)
  }
  lines.push('', `## ${m.ai.tableTitle}`, '', m.ai.tableHint, '', ...productTable(d, m))
  return lines.join('\n') + '\n'
}

/** Cells as Markdown keeps them: no pipes, no line breaks. */
const mdCell = (s: string) =>
  s
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' / ')
    .trim()

/** The products as a Markdown table; values plain (numbers without unit, dates ISO) so they read back exactly. */
export function productTable(d: Pick<Input, 'products' | 'properties'>, m: Messages): string[] {
  const own: [string, (p: Product) => string][] = (
    [
      ['url', m.field.url],
      ['brand', m.field.brand],
      ['model', m.field.model],
      ['variant', m.field.variant],
      ['productType', m.field.productType],
      ['price', m.field.price],
      ['retailer', m.field.retailer],
      ['gtin', m.field.gtin],
      ['mpn', m.field.mpn],
    ] as const
  )
    // Link, name and price always; the rest only when some product has it.
    .filter(([key]) => ['url', 'brand', 'model', 'price'].includes(key) || d.products.some((p) => p[key]))
    .map(([key, label]) => [label, (p: Product) => (key === 'price' ? (p.price === null ? '' : String(p.price)) : String(p[key] ?? ''))])
  const fields: [string, (p: Product) => string][] = d.properties.map((prop) => [
    prop.unit && !prop.name.toLowerCase().includes(prop.unit.toLowerCase()) ? `${prop.name} (${prop.unit})` : prop.name,
    (p) => {
      const v = p.values?.[prop.id]
      if (v === null || v === undefined) return ''
      if (typeof v === 'boolean') return v ? m.common.yes : m.common.no
      return String(v)
    },
  ])
  const cols = [...own, ...fields]
  const row = (cells: string[]) => `| ${cells.map(mdCell).join(' | ')} |`
  return [row(cols.map(([h]) => h)), `|${cols.map(() => ' --- |').join('')}`, ...d.products.map((p) => row(cols.map(([, get]) => get(p))))]
}
