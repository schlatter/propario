/**
 * The start of a comparison: a new one opens at once, and four steps say what is still missing:
 * its name and what one is looking for, a budget, requirements and a first candidate. The start card
 * (src/pages/project/StartCard.tsx) shows them until it is closed or, on opening, all are done.
 */
import type { Product, Project, Requirement } from '../db/types'
import { fieldFromRequirement } from '../import/normalize'

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
