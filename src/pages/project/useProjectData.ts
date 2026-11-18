import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../../db/db'
import type { Product, Project, PropertyDef, Requirement } from '../../db/types'
import { CHECKABLE, evaluate, summarize, BLOCKING, withBudget, type CheckResult, type Summary } from '../../domain/requirements'
import { useI18n } from '../../i18n'

export interface ProjectData {
  project: Project
  products: Product[]
  properties: PropertyDef[]
  requirements: Requirement[]
  /** What products are checked against: the requirements and, when set, the budget as a must. */
  rules: Requirement[]
  propMap: Map<string, PropertyDef>
  checkable: Requirement[]
  summaries: Map<string, Summary>
  results: (product: Product) => { id: string; result: CheckResult; blocking: boolean; label: string }[]
}

/** Live view of one project; `undefined` while loading, `null` if it does not exist. */
export function useProjectData(id: string | undefined): ProjectData | null | undefined {
  const { m, fmt } = useI18n()
  const raw = useLiveQuery(async () => {
    if (!id) return null
    const project = await db.projects.get(id)
    if (!project) return null
    const [products, properties, requirements] = await Promise.all([
      db.products.where('projectId').equals(id).sortBy('order'),
      db.properties.where('projectId').equals(id).sortBy('order'),
      db.requirements.where('projectId').equals(id).sortBy('order'),
    ])
    return { project, products, properties, requirements }
  }, [id])

  return useMemo(() => {
    if (raw === undefined) return undefined
    if (raw === null) return null
    const propMap = new Map(raw.properties.map((p) => [p.id, p]))
    const rules = withBudget(raw.project, raw.requirements, `${m.budget.label} ≤ ${fmt.money(raw.project.budget ?? 0)}`)
    const checkable = rules.filter((r) => CHECKABLE.includes(r.priority))
    const summaries = new Map(raw.products.map((p) => [p.id, summarize(rules, p, propMap)]))
    const results = (p: Product) =>
      checkable.map((r) => ({ id: r.id, result: evaluate(r, p, propMap), blocking: BLOCKING.includes(r.priority), label: r.label }))
    return { ...raw, rules, propMap, checkable, summaries, results }
  }, [raw, m, fmt])
}
