/**
 * Everything the interface changes goes through here. Each function reads the current state
 * from the cache, describes the change (create / patch / delete, see src/shared/records.ts) and
 * commits it: server first, then the cache.
 */
import { db, newId, nowIso, type AppDB } from './db'
import { makeProduct, makeProject, makeProperty, makeRequirement } from './factories'
import type { Product, Project, PropertyDef, Requirement } from './types'
import { sanitize, type Change } from '../shared/records.ts'
import { commit, setLocalRole } from '../sync'
import { rehostImages } from '../images'

/** All records belonging to one project. Used for duplicate, export and import. */
export interface ProjectBundle {
  project: Project
  properties: PropertyDef[]
  products: Product[]
  requirements: Requirement[]
}

const patch = (kind: Change['kind'], r: { id: string; projectId?: string }, fields: Record<string, unknown>): Change => ({
  op: 'patch',
  kind,
  id: r.id,
  projectId: kind === 'projects' ? r.id : r.projectId!,
  patch: { ...fields, updatedAt: nowIso() },
})

export async function createProject(data: Partial<Project>): Promise<Project> {
  const project = makeProject(data)
  await commit([{ op: 'create', kind: 'projects', record: project }])
  await setLocalRole(project.id, 'owner')
  return project
}

export async function updateProject(id: string, fields: Partial<Project>) {
  await commit([patch('projects', { id }, fields)])
}

export async function loadBundle(projectId: string, database: AppDB = db): Promise<ProjectBundle | null> {
  const project = await database.projects.get(projectId)
  if (!project) return null
  const [properties, products, requirements] = await Promise.all([
    database.properties.where('projectId').equals(projectId).sortBy('order'),
    database.products.where('projectId').equals(projectId).sortBy('order'),
    database.requirements.where('projectId').equals(projectId).sortBy('order'),
  ])
  return { project, properties, products, requirements }
}

/**
 * Gives every record of a bundle a fresh id and rewires all internal references
 * (property values, conditions, manual checks, decision).
 */
export function remapBundle(b: ProjectBundle, projectPatch: Partial<Project> = {}): ProjectBundle {
  const now = nowIso()
  const projectId = newId()
  const propMap = new Map(b.properties.map((p) => [p.id, newId()]))
  const reqMap = new Map(b.requirements.map((r) => [r.id, newId()]))
  const prodMap = new Map(b.products.map((p) => [p.id, newId()]))

  const properties = b.properties.map((p) => ({ ...p, id: propMap.get(p.id)!, projectId, updatedAt: now }))
  const requirements = b.requirements.map((r) => {
    let condition = r.condition
    if (condition?.target.kind === 'property') {
      const mapped = propMap.get(condition.target.propertyId)
      condition = mapped ? { ...condition, target: { kind: 'property', propertyId: mapped } } : null
    }
    return { ...r, id: reqMap.get(r.id)!, projectId, condition, updatedAt: now }
  })
  const products = b.products.map((p) => {
    const values: Product['values'] = {}
    for (const [k, v] of Object.entries(p.values ?? {})) {
      const mapped = propMap.get(k)
      if (mapped) values[mapped] = v
    }
    const checks: Product['checks'] = {}
    for (const [k, v] of Object.entries(p.checks ?? {})) {
      const mapped = reqMap.get(k)
      if (mapped) checks[mapped] = v
    }
    return { ...p, id: prodMap.get(p.id)!, projectId, values, checks, createdAt: now, updatedAt: now }
  })
  const project: Project = {
    ...b.project,
    ...projectPatch,
    id: projectId,
    decisionProductId: b.project.decisionProductId ? (prodMap.get(b.project.decisionProductId) ?? null) : null,
    createdAt: now,
    updatedAt: now,
  }
  return { project, properties, products, requirements }
}

/** Creates a whole comparison (import, restore, duplicate). Images are copied into it first. */
export async function insertBundle(b: ProjectBundle) {
  // The comparison must exist on the server before images can be stored in it.
  await commit([{ op: 'create', kind: 'projects', record: sanitize('projects', b.project) }])
  await setLocalRole(b.project.id, 'owner')
  const products = await rehostImages(b.products, b.project.id)
  await commit([
    ...b.properties.map((record): Change => ({ op: 'create', kind: 'properties', record: sanitize('properties', record) })),
    ...products.map((record): Change => ({ op: 'create', kind: 'products', record: sanitize('products', record) })),
    ...b.requirements.map((record): Change => ({ op: 'create', kind: 'requirements', record: sanitize('requirements', record) })),
  ])
}

export async function duplicateProject(projectId: string, name: string): Promise<string | null> {
  const bundle = await loadBundle(projectId)
  if (!bundle) return null
  const copy = remapBundle(bundle, { name })
  await insertBundle(copy)
  return copy.project.id
}

/** Only the owner may delete a comparison; the server enforces it. */
export async function deleteProject(projectId: string) {
  await commit([{ op: 'delete', kind: 'projects', id: projectId, projectId }])
}

async function nextOrder(table: 'products' | 'properties' | 'requirements', projectId: string) {
  const rows = await db[table].where('projectId').equals(projectId).toArray()
  return rows.reduce((m, r) => Math.max(m, r.order), -1) + 1
}

// ---------- products ----------

export async function addProduct(projectId: string, data: Partial<Product> = {}): Promise<Product> {
  const product = makeProduct(projectId, { ...data, order: await nextOrder('products', projectId) })
  await commit([{ op: 'create', kind: 'products', record: product }])
  return product
}

export async function updateProduct(product: Product, fields: Partial<Product>) {
  await commit([patch('products', product, fields)])
}

/** Changes one custom value only, so two people editing different fields of a product do not collide. */
export async function setProductValue(product: Product, propertyId: string, value: Product['values'][string]) {
  await commit([patch('products', product, { values: { [propertyId]: value === '' ? null : value } })])
}

export async function duplicateProduct(product: Product): Promise<Product> {
  const { id: _id, createdAt: _c, updatedAt: _u, order: _o, ...rest } = product
  return addProduct(product.projectId, { ...rest, purchase: { status: 'none', date: '', price: null, retailer: '', note: '' } })
}

export async function deleteProduct(product: Product) {
  const project = await db.projects.get(product.projectId)
  const changes: Change[] = [{ op: 'delete', kind: 'products', id: product.id, projectId: product.projectId }]
  if (project?.decisionProductId === product.id) changes.push(patch('projects', project, { decisionProductId: null }))
  await commit(changes)
}

/** Marks (or clears) the final decision and moves the project status forward when appropriate. */
export async function setDecision(project: Project, productId: string | null) {
  const status =
    productId && (project.status === 'research' || project.status === 'comparing')
      ? 'decided'
      : !productId && project.status === 'decided'
        ? 'comparing'
        : project.status
  await updateProject(project.id, { decisionProductId: productId, status })
}

// ---------- properties ----------

export async function addProperty(projectId: string, data: Partial<PropertyDef>): Promise<PropertyDef> {
  const prop = makeProperty(projectId, { ...data, order: await nextOrder('properties', projectId) })
  await commit([{ op: 'create', kind: 'properties', record: prop }])
  return prop
}

export async function updateProperty(prop: PropertyDef, fields: Partial<PropertyDef>) {
  await commit([patch('properties', prop, fields)])
}

/** Removes a property, its values on all products and conditions that refer to it. */
export async function deleteProperty(prop: PropertyDef) {
  const [products, requirements] = await Promise.all([
    db.products.where('projectId').equals(prop.projectId).toArray(),
    db.requirements.where('projectId').equals(prop.projectId).toArray(),
  ])
  await commit([
    ...products.filter((p) => prop.id in (p.values ?? {})).map((p) => patch('products', p, { values: { [prop.id]: null } })),
    ...requirements
      .filter((r) => r.condition?.target.kind === 'property' && r.condition.target.propertyId === prop.id)
      .map((r) => patch('requirements', r, { condition: null })),
    { op: 'delete', kind: 'properties', id: prop.id, projectId: prop.projectId },
  ])
}

export async function reorder<T extends { id: string; order: number; projectId: string }>(table: 'properties' | 'requirements' | 'products', items: T[]) {
  await commit(
    items.flatMap((item, i) => (item.order === i ? [] : [{ op: 'patch', kind: table, id: item.id, projectId: item.projectId, patch: { order: i } } as Change])),
  )
}

// ---------- requirements ----------

export async function addRequirement(projectId: string, data: Partial<Requirement>): Promise<Requirement> {
  const req = makeRequirement(projectId, { ...data, order: await nextOrder('requirements', projectId) })
  await commit([{ op: 'create', kind: 'requirements', record: req }])
  return req
}

export async function updateRequirement(req: Requirement, fields: Partial<Requirement>) {
  await commit([patch('requirements', req, fields)])
}

export async function deleteRequirement(req: Requirement) {
  const products = await db.products.where('projectId').equals(req.projectId).toArray()
  await commit([
    ...products.filter((p) => req.id in (p.checks ?? {})).map((p) => patch('products', p, { checks: { [req.id]: null } })),
    { op: 'delete', kind: 'requirements', id: req.id, projectId: req.projectId },
  ])
}

/** Unique project name: "Name", "Name (2)", ... */
export async function uniqueProjectName(name: string, database: AppDB = db): Promise<string> {
  const names = new Set((await database.projects.toArray()).map((p) => p.name))
  if (!names.has(name)) return name
  let i = 2
  while (names.has(`${name} (${i})`)) i++
  return `${name} (${i})`
}
