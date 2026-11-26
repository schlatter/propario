/**
 * The start of a comparison: a new one opens at once, and four steps say what is still missing:
 * its name and what one is looking for, a budget, requirements and a first candidate. The start card
 * (src/pages/project/StartCard.tsx) shows them until it is closed or, on opening, all are done.
 */
import type { ConditionOp, Product, Project, PropertyDef, Requirement } from '../db/types'
import type { DraftCondition } from '../import/excel'
import { fieldFromRequirement, norm, splitUnit } from '../import/normalize'

export interface StartSteps {
  /** The goal is written down. */
  goal: boolean
  /** A budget is set. */
  budget: boolean
  /** A requirement or a budget is set. */
  criteria: boolean
  /** A first candidate is in. */
  product: boolean
}

export function startSteps(project: Project, products: Product[], requirements: Requirement[]): StartSteps {
  return {
    goal: project.description.trim() !== '',
    budget: project.budget != null || project.budgetMin != null,
    criteria: requirements.length > 0 || project.budget != null || project.budgetMin != null,
    product: products.length > 0,
  }
}

/** The card is offered on opening a comparison while a candidate or a criterion is missing. */
export const startNeeded = (s: StartSteps) => !s.product || !s.criteria

/**
 * A requirement typed with a limit ("Breite max. 60 cm", "Traglast mindestens 2 kg"): the number
 * field it checks and its rule. Null when the text states no limit and number; it then stays a
 * requirement checked by hand. `unit` is used when the text ends with its number ("Width at most
 * 60"); a word after the number may be a unit Propario does not know, so then none is guessed.
 */
export function ruleFromText(label: string, unit = ''): { name: string; unit: string; op: 'lte' | 'gte'; value: number } | null {
  const f = fieldFromRequirement(label)
  if (!f.op || f.value === undefined || !f.name) return null
  return { name: f.name, unit: f.unit || (/\d\s*$/.test(label) ? unit : ''), op: f.op, value: f.value }
}

/**
 * A comparison just made and left as it was: still its first name, nothing written, added or
 * set. Only such a one is removed again when it is left (src/pages/project/StartCard.tsx).
 */
export function untouched(project: Project, firstName: string, products: Product[], requirements: Requirement[], properties: unknown[]): boolean {
  return (
    project.name === firstName &&
    !project.category.trim() &&
    !project.description.trim() &&
    !project.notes.trim() &&
    project.budget == null &&
    project.budgetMin == null &&
    !products.length &&
    !requirements.length &&
    !properties.length
  )
}

/** Where a requirement's automatic check looks: the price, a field of the comparison, or a number field still to add. */
export type RuleTarget = { kind: 'price' } | { kind: 'field'; id: string } | { kind: 'newField'; name: string; unit: string }
export interface PlannedRule {
  target: RuleTarget
  op: ConditionOp
  value: number | string
}

const PRICE = /^(preis|price|budget|kosten|cost|gesamtpreis|max preis)$/

/**
 * The automatic check for a requirement, from its rule ("Traglast (kg) >= 2", as an AI or the
 * Excel export writes it) or, without one, from its words ("Breite max. 60 cm"). A field of the
 * comparison is used when its name (with or without unit) matches; a number limit without such a
 * field asks for a new number field. Null: checked by hand. `unit` is the suggestion's unit for
 * a number typed without one.
 */
export function planRule(label: string, condition: DraftCondition | null, properties: PropertyDef[], unit = ''): PlannedRule | null {
  const find = (name: string) => {
    const n = norm(name)
    return properties.find((p) => norm(p.name) === n || norm(`${p.name} (${p.unit})`) === n || norm(`${p.name} ${p.unit}`) === n)
  }
  if (condition) {
    if (condition.propertyName === null || PRICE.test(norm(condition.propertyName.replace(/\([^)]*\)/g, ''))))
      return { target: { kind: 'price' }, op: condition.op, value: condition.value }
    const prop = find(condition.propertyName)
    if (prop) return { target: { kind: 'field', id: prop.id }, op: condition.op, value: condition.value }
    if (typeof condition.value !== 'number') return null
    const split = splitUnit(condition.propertyName)
    return { target: { kind: 'newField', name: split.name || condition.propertyName, unit: split.unit }, op: condition.op, value: condition.value }
  }
  const rule = ruleFromText(label, unit)
  if (!rule) return null
  if (PRICE.test(norm(rule.name))) return { target: { kind: 'price' }, op: rule.op, value: rule.value }
  const prop = properties.find((p) => p.type === 'number' && norm(p.name) === norm(rule.name))
  return { target: prop ? { kind: 'field', id: prop.id } : { kind: 'newField', name: rule.name, unit: rule.unit }, op: rule.op, value: rule.value }
}
