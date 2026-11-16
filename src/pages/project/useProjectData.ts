import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../../db/db'
import type { Product, Project, PropertyDef, Requirement } from '../../db/types'
import { CHECKABLE, evaluate, summarize, BLOCKING, type CheckResult, type Summary } from '../../domain/requirements'

export interface ProjectData {
  project: Project
  products: Product[]
  properties: PropertyDef[]
  requirements: Requirement[]
  propMap: Map<string, PropertyDef>
  checkable: Requirement[]
  summaries: Map<string, Summary>
  results: (product: Product) => { id: string; result: CheckResult; blocking: boolean; label: string }[]
}

/** Live view of one project; `undefined` while loading, `null` if it does not exist. */
export function useProjectData(id: string | undefined): ProjectData | null | undefined {
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
    const checkable = raw.requirements.filter((r) => CHECKABLE.includes(r.priority))
    const summaries = new Map(raw.products.map((p) => [p.id, summarize(raw.requirements, p, propMap)]))
    const results = (p: Product) =>
      checkable.map((r) => ({ id: r.id, result: evaluate(r, p, propMap), blocking: BLOCKING.includes(r.priority), label: r.label }))
    return { ...raw, propMap, checkable, summaries, results }
  }, [raw])
}
