import type { Condition, Priority, Product, Project, PropertyDef, Requirement } from '../db/types'
import { parseBoolean, parseNumber } from './values'

export type CheckResult = 'pass' | 'fail' | 'unknown'

/** Priorities whose failure disqualifies a product. */
export const BLOCKING: Priority[] = ['must', 'exclusion']

/** Priorities that can be checked at all (info rows are notes only). */
export const CHECKABLE: Priority[] = ['must', 'important', 'wish', 'bonus', 'exclusion', 'avoid']

function conditionHolds(c: Condition, product: Product, props: Map<string, PropertyDef>): boolean | null {
  let raw: unknown
  if (c.target.kind === 'price') raw = product.price
  else {
    if (!props.has(c.target.propertyId)) return null
    raw = product.values[c.target.propertyId]
  }
  if (raw === null || raw === undefined || raw === '') return null

  switch (c.op) {
    case 'isTrue':
    case 'isFalse': {
      const b = parseBoolean(raw)
      if (b === null) return null
      return c.op === 'isTrue' ? b : !b
    }
    case 'contains':
      return String(raw)
        .toLowerCase()
        .includes(String(c.value ?? '').toLowerCase())
    case 'eq':
    case 'neq': {
      if (typeof raw === 'boolean') {
        const b = parseBoolean(c.value)
        if (b === null) return null
        return (raw === b) === (c.op === 'eq')
      }
      const a = parseNumber(raw)
      const b = parseNumber(c.value)
      const equal =
        a !== null && b !== null
          ? a === b
          : String(raw).trim().toLowerCase() ===
            String(c.value ?? '')
              .trim()
              .toLowerCase()
      return c.op === 'eq' ? equal : !equal
    }
    default: {
      // ISO dates compare as text ("2024-05-01" < "2024-06-01").
      const iso = /^\d{4}-\d{2}-\d{2}$/
      if (typeof raw === 'string' && iso.test(raw) && iso.test(String(c.value ?? ''))) {
        const r = raw.localeCompare(String(c.value))
        return c.op === 'lte' ? r <= 0 : c.op === 'lt' ? r < 0 : c.op === 'gte' ? r >= 0 : r > 0
      }
      const a = parseNumber(raw)
      const b = parseNumber(c.value)
      if (a === null || b === null) return null
      if (c.op === 'lte') return a <= b
      if (c.op === 'lt') return a < b
      if (c.op === 'gte') return a >= b
      return a > b
    }
  }
}

/**
 * Checks one requirement for one product. Missing data is always `unknown`,
 * never a failure. For exclusion/avoid requirements the condition describes the
 * unwanted property, so a matching condition means `fail`.
 */
export function evaluate(req: Requirement, product: Product, props: Map<string, PropertyDef>): CheckResult {
  if (!CHECKABLE.includes(req.priority)) return 'unknown'
  const manual = product.checks[req.id]
  if (manual) return manual
  if (!req.condition) return 'unknown'
  const holds = conditionHolds(req.condition, product, props)
  if (holds === null) return 'unknown'
  const inverted = req.priority === 'exclusion' || req.priority === 'avoid'
  return holds !== inverted ? 'pass' : 'fail'
}

/**
 * How much each soft requirement counts towards the fit. Must and exclusion are not weighed:
 * they are gates (`blocked`, `qualified`). "Avoid" counts when the product avoids it.
 */
export const WEIGHT: Partial<Record<Priority, number>> = { important: 3, wish: 2, bonus: 1, avoid: 2 }

export interface Summary {
  pass: number
  fail: number
  unknown: number
  /** A must or exclusion requirement is violated. */
  blocked: boolean
  /** All must/exclusion requirements are known to pass. */
  qualified: boolean
  /** Weighted share (0–100) of the known soft requirements that pass; null while none is known. */
  fit: number | null
  /** Soft requirements still unknown – they do not lower the fit. */
  fitOpen: number
}

export function summarize(reqs: Requirement[], product: Product, props: Map<string, PropertyDef>): Summary {
  const s: Summary = { pass: 0, fail: 0, unknown: 0, blocked: false, qualified: true, fit: null, fitOpen: 0 }
  let won = 0
  let known = 0
  for (const r of reqs) {
    if (!CHECKABLE.includes(r.priority)) continue
    const res = evaluate(r, product, props)
    s[res]++
    if (BLOCKING.includes(r.priority)) {
      if (res === 'fail') s.blocked = true
      if (res !== 'pass') s.qualified = false
    }
    const w = WEIGHT[r.priority]
    if (w) {
      if (res === 'unknown') s.fitOpen++
      else {
        known += w
        if (res === 'pass') won += w
      }
    }
  }
  if (known) s.fit = Math.round((100 * won) / known)
  return s
}

export const OP_SYMBOL: Record<Condition['op'], string> = {
  lte: '≤',
  lt: '<',
  gte: '≥',
  gt: '>',
  eq: '=',
  neq: '≠',
  contains: '∋',
  isTrue: '✓',
  isFalse: '✗',
}

/** The table column a requirement's rule looks at: `prop:<id>` or `price`; null without a rule. */
export function columnOf(r: Requirement): string | null {
  if (!r.condition || !CHECKABLE.includes(r.priority)) return null
  // A rule still being written ("≤" without a value) shows nowhere yet.
  const { op, value } = r.condition
  if (op !== 'isTrue' && op !== 'isFalse' && (value === undefined || value === '')) return null
  return r.condition.target.kind === 'price' ? 'price' : `prop:${r.condition.target.propertyId}`
}

/** Requirements with a rule, grouped by the column they look at. */
export function requirementsByColumn(reqs: Requirement[]): Map<string, Requirement[]> {
  const out = new Map<string, Requirement[]>()
  for (const r of reqs) {
    const col = columnOf(r)
    if (col) out.set(col, [...(out.get(col) ?? []), r])
  }
  return out
}

/**
 * One cell's verdict for the requirements on its column: fail if any fails, pass if all are
 * known to pass, otherwise unknown (shown without colour).
 */
export function cellCheck(reqs: Requirement[], product: Product, props: Map<string, PropertyDef>): CheckResult {
  const results = reqs.map((r) => evaluate(r, product, props))
  if (results.includes('fail')) return 'fail'
  return results.length && results.every((x) => x === 'pass') ? 'pass' : 'unknown'
}

/** Met / known of the blocking (must, exclusion) and of the other requirements, for two bars. */
export function splitByWeight(items: { result: CheckResult; blocking: boolean }[]) {
  const part = (blocking: boolean) => {
    const list = items.filter((i) => i.blocking === blocking)
    return { pass: list.filter((i) => i.result === 'pass').length, fail: list.filter((i) => i.result === 'fail').length, total: list.length }
  }
  return { must: part(true), other: part(false) }
}

/** The ids of the rules a comparison's budget stands for (never stored as requirements). */
export const BUDGET_RULE = 'budget'
export const BUDGET_MIN_RULE = 'budget-min'

/**
 * The comparison's rules: its budget in front – "price ≤ maximum" (must unless chosen otherwise)
 * and, when set, "price ≥ minimum" (important unless chosen otherwise) – then its requirements.
 * Measurable and relevant for almost every purchase, so it needs no rule of its own.
 */
export function withBudget(
  project: Pick<Project, 'id' | 'budget' | 'budgetPriority' | 'budgetMin' | 'budgetMinPriority'>,
  requirements: Requirement[],
  labels: { max: string; min: string },
): Requirement[] {
  const rule = (id: string, label: string, priority: Priority, op: 'lte' | 'gte', value: number, order: number): Requirement => ({
    id,
    projectId: project.id,
    category: '',
    label,
    description: '',
    priority,
    condition: { target: { kind: 'price' }, op, value },
    order,
    updatedAt: '',
  })
  const out: Requirement[] = []
  if (project.budget !== null && project.budget !== undefined)
    out.push(rule(BUDGET_RULE, labels.max, project.budgetPriority ?? 'must', 'lte', project.budget, -2))
  if (project.budgetMin !== null && project.budgetMin !== undefined)
    out.push(rule(BUDGET_MIN_RULE, labels.min, project.budgetMinPriority ?? 'important', 'gte', project.budgetMin, -1))
  return [...out, ...requirements]
}
