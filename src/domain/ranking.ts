/**
 * Placing values side by side: which is best and worst, how far each is from the best, and where
 * it sits between the smallest and the largest. "Better" must be known – lower prices, higher
 * ratings, or what a field's setting or requirement rule says; without it only the position is
 * shown, never a judgement.
 */
import type { PropertyDef, Requirement } from '../db/types'

export type Better = 'lower' | 'higher'

export interface Ranking {
  best: Set<number>
  worst: Set<number>
  /** Distance from the best value (0 for the best), null without a value or direction. */
  delta: (number | null)[]
  /** 0 … 1 between the smallest and the largest value, null without a value or spread. */
  scale: (number | null)[]
}

export function rank(values: (number | null | undefined)[], better?: Better): Ranking {
  const known = values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null))
  const nums = known.filter((v): v is number => v !== null)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const spread = nums.length >= 2 && max > min
  const out: Ranking = { best: new Set(), worst: new Set(), delta: known.map(() => null), scale: known.map(() => null) }
  if (!spread) return out
  out.scale = known.map((v) => (v === null ? null : (v - min) / (max - min)))
  if (!better) return out
  const bestValue = better === 'lower' ? min : max
  const worstValue = better === 'lower' ? max : min
  known.forEach((v, i) => {
    if (v === null) return
    if (v === bestValue) out.best.add(i)
    if (v === worstValue) out.worst.add(i)
    out.delta[i] = Math.round((v - bestValue) * 1000) / 1000
  })
  return out
}

/**
 * Which way a field is better: its own setting, else what its requirement rules say ("Tiefe ≤ 40"
 * → lower). Rules pulling both ways say nothing.
 */
export function directionOf(prop: PropertyDef, rules: Requirement[]): Better | undefined {
  if (prop.better === 'lower' || prop.better === 'higher') return prop.better
  const ways = new Set<Better>()
  for (const r of rules) {
    const c = r.condition
    if (!c || c.target.kind !== 'property' || c.target.propertyId !== prop.id) continue
    const way: Better | null = c.op === 'lte' || c.op === 'lt' ? 'lower' : c.op === 'gte' || c.op === 'gt' ? 'higher' : null
    // An exclusion or avoid rule turns the wish around: "avoid depth ≥ 60" means lower is better.
    if (way) ways.add(r.priority === 'exclusion' || r.priority === 'avoid' ? (way === 'lower' ? 'higher' : 'lower') : way)
  }
  return ways.size === 1 ? [...ways][0] : undefined
}
