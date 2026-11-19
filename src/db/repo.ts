/**
 * Everything the interface changes goes through here. Each function reads the current state
 * from the cache, describes the change (create / patch / delete, see src/shared/records.ts) and
 * commits it (src/sync.ts): shown at once, taken back if the server does not accept it.
 */
import { db, newId, nowIso, type AppDB } from './db'
import { makeProduct, makeProject, makeProperty, makeRequirement } from './factories'
import type { Offer, Product, Project, PropertyDef, Requirement, Review, Vote } from './types'
import { sanitize, type Change } from '../shared/records.ts'
import { commit, setLocalRole } from '../sync'
import { rehostImages } from '../images'
import { todayIso } from '../domain/values'
import { priceFromOffers } from '../domain/offers'
import { DIMENSION_UNIT, planFacts } from '../domain/page-import'
import { activeMessages } from '../i18n/active'
import type { ProductFacts } from '../shared/product-facts.ts'

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
  // Whoever adds a product found it, unless someone else is named.
  const me = (await db.meta.get('me'))?.value as { name?: string } | undefined
  const product = makeProduct(projectId, { foundBy: me?.name ?? '', ...data, order: await nextOrder('products', projectId) })
  await commit([{ op: 'create', kind: 'products', record: product }])
  return product
}

/**
 * Applies a table merge (src/import/merge.ts) in one go: creates the new fields, adds the new
 * products and patches the updated ones. Values keyed by a new field's key go to that field.
 */
export async function mergeProducts(
  projectId: string,
  fields: { key: string; name: string; type: PropertyDef['type']; unit: string; options: string[] }[],
  adds: Product[],
  updates: { product: Product; patch: Partial<Product> }[],
) {
  const me = (await db.meta.get('me'))?.value as { name?: string } | undefined
  let fieldOrder = await nextOrder('properties', projectId)
  let order = await nextOrder('products', projectId)
  const created = fields.map(({ key, ...f }) => [key, makeProperty(projectId, { ...f, order: fieldOrder++ })] as const)
  const ids = new Map(created.map(([key, prop]) => [key, prop.id]))
  const remap = (values: Product['values'] | undefined) =>
    Object.fromEntries(Object.entries(values ?? {}).flatMap(([k, v]) => (k.startsWith('new:') ? (ids.has(k) ? [[ids.get(k)!, v]] : []) : [[k, v]])))
  const today = todayIso()
  await commit([
    ...created.map(([, record]) => ({ op: 'create', kind: 'properties', record }) as Change),
    ...adds.map((p) => {
      const { id: _id, projectId: _p, createdAt: _c, updatedAt: _u, order: _o, ...rest } = p
      const record = makeProduct(projectId, {
        ...rest,
        foundBy: rest.foundBy || me?.name || '',
        priceDate: rest.price !== null ? today : '',
        values: remap(p.values),
        order: order++,
      })
      return { op: 'create', kind: 'products', record } as Change
    }),
    ...updates.map(({ product, patch: fields }) => {
      const next: Partial<Product> = { ...fields }
      if ('values' in next) next.values = remap(next.values)
      if ('price' in next && next.price !== product.price) next.priceDate = next.price === null ? '' : today
      return patch('products', product, next)
    }),
  ])
}

export async function updateProduct(product: Product, fields: Partial<Product>) {
  // A price someone sets is a price seen today; the date says how current it is.
  if ('price' in fields && !('priceDate' in fields) && fields.price !== product.price)
    fields = { ...fields, priceDate: fields.price === null ? '' : todayIso() }
  await commit([patch('products', product, fields)])
}

/**
 * List fields (offers, reviews) are stored as a whole. Edits of them run one after another and
 * each starts from the current record, so quick edits of several entries do not undo each other.
 */
let listQueue: Promise<unknown> = Promise.resolve()
function changeList(product: Product, change: (current: Product) => Partial<Product>): Promise<void> {
  const run = listQueue.then(async () => {
    const current = (await db.products.get(product.id)) ?? product
    await updateProduct(current, change(current))
  })
  listQueue = run.catch(() => {})
  return run
}

/**
 * Fills a product's empty fields from what its shop page says (src/domain/page-import.ts) and
 * creates width/height/depth/weight fields the comparison lacks. Runs in the same queue as the
 * list edits, so several products loading at once create each field only once.
 * Returns what was filled: product field keys and field names.
 */
export function takeFacts(product: Product, facts: ProductFacts, opts: { refreshPrice?: boolean } = {}): Promise<string[]> {
  const run = listQueue.then(async () => {
    const p = (await db.products.get(product.id)) ?? product
    const properties = await db.properties.where('projectId').equals(p.projectId).sortBy('order')
    const plan = planFacts(p, facts, properties, opts)
    const values = { ...(plan.patch.values ?? {}) }
    const names = activeMessages().pageImport
    for (const c of plan.create) {
      const prop = await addProperty(p.projectId, { name: names[c.dimension], type: 'number', unit: DIMENSION_UNIT[c.dimension] })
      values[prop.id] = c.value
      plan.filled.push(prop.name)
    }
    const patch = { ...plan.patch, ...(Object.keys(values).length ? { values } : {}) }
    if (Object.keys(patch).length) await updateProduct(p, patch)
    return plan.filled
  })
  listQueue = run.catch(() => {})
  return run
}

/** Changes a product's offers; the cheapest one becomes its price (see src/domain/offers.ts). */
export function changeOffers(product: Product, fn: (offers: Offer[]) => Offer[]) {
  return changeList(product, (p) => {
    const offers = fn(p.offers ?? [])
    return { offers, ...priceFromOffers(offers) }
  })
}

export function changeReviews(product: Product, fn: (reviews: Review[]) => Review[]) {
  return changeList(product, (p) => ({ reviews: fn(p.reviews ?? []) }))
}

/** Changes one custom value only, so two people editing different fields of a product do not collide. */
export async function setProductValue(product: Product, propertyId: string, value: Product['values'][string]) {
  await commit([patch('products', product, { values: { [propertyId]: value === '' ? null : value } })])
}

export async function duplicateProduct(product: Product): Promise<Product> {
  const { id: _id, createdAt: _c, updatedAt: _u, order: _o, ...rest } = product
  return addProduct(product.projectId, { ...rest, purchase: makeProduct(product.projectId).purchase })
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

/** Swipe mode: the signed-in person's verdict on a product (null takes it back). Only one's own vote merges. */
/** One person's verdict; giving one marks a product not looked at yet as checked. */
export async function setVote(product: Product, userId: string, vote: Vote | null) {
  const fields: Partial<Product> = { votes: { [userId]: vote } as Product['votes'] }
  if (vote && product.candidate === 'open') fields.candidate = 'checked'
  await commit([patch('products', product, fields)])
}
