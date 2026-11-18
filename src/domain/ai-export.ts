/**
 * A comparison as plain text for one's own AI ("Copy for my AI"): requirements with their
 * priority, the budget, and every product with its price, fields, verdicts, outside ratings and
 * the notes everyone in the comparison sees – followed by a question. Nothing leaves Propario
 * by itself; the person pastes it where they choose. Names of people are left out: ratings
 * appear as stars only.
 */
import type { Product, Project, PropertyDef, Requirement } from '../db/types'
import type { Formatters } from '../i18n'
import type { Messages } from '../i18n/en'
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

export function comparisonForAi(d: Input, m: Messages, fmt: Formatters): string {
  const lines: string[] = [`# ${d.project.name}${d.project.category ? ` (${d.project.category})` : ''}`, '', m.ai.prompt, '']
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
    const status = p.candidate === 'excluded' ? `${m.candidate.excluded}${exclusionText(p, m) ? `: ${exclusionText(p, m)}` : ''}` : m.candidate[p.candidate]
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
  return lines.join('\n') + '\n'
}
