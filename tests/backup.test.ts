// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/db'
import { exportAll, exportProject, parseBackup, restoreMerge, restoreReplace } from '../src/db/backup'
import {
  addProduct,
  addProperty,
  addRequirement,
  createProject,
  deleteProject,
  duplicateProject,
  loadBundle,
  setDecision,
  setProductValue,
  updateProduct,
} from '../src/db/repo'
import { setMember } from '../server/store.ts'
import { testServer } from './helpers/server'

async function seed() {
  const project = await createProject({ name: 'Küchenschrank', category: 'Möbel' })
  const depth = await addProperty(project.id, { name: 'Tiefe', type: 'number', unit: 'cm' })
  const req = await addRequirement(project.id, {
    label: 'Max. Tiefe',
    priority: 'must',
    condition: { target: { kind: 'property', propertyId: depth.id }, op: 'lte', value: 40 },
  })
  const product = await addProduct(project.id, {
    brand: 'Nordhaus',
    model: 'Arvika',
    price: 499.99,
    values: { [depth.id]: 40 },
    checks: { [req.id]: 'pass' },
    ratings: [{ person: 'Ada', stars: 4, note: 'schön' }],
  })
  await setDecision((await db.projects.get(project.id))!, product.id)
  return { project, depth, req, product }
}

let server: ReturnType<typeof testServer>
let ada: ReturnType<ReturnType<typeof testServer>['person']>

beforeEach(async () => {
  server = testServer()
  ada = server.person('Ada', true)
  await ada.use()
})

const withoutIds = (b: Awaited<ReturnType<typeof exportAll>>) => ({
  projects: b.projects.map(({ name, category, status }) => ({ name, category, status })),
  products: b.products.map(({ brand, model, price, ratings }) => ({ brand, model, price, ratings })),
  properties: b.properties.map(({ name, type, unit }) => ({ name, type, unit })),
  requirements: b.requirements.map(({ label, priority, condition }) => ({ label, priority, op: condition?.op, value: condition?.value })),
})

describe('backup', () => {
  it('exports and restores everything (replace)', async () => {
    await seed()
    const before = await exportAll()
    const parsed = parseBackup(JSON.stringify(before))
    expect(parsed.ok).toBe(true)
    await deleteProject(before.projects[0].id)
    expect(await db.projects.count()).toBe(0)

    await restoreReplace((parsed as { ok: true; file: typeof before }).file)
    const after = await exportAll()
    expect(withoutIds(after)).toEqual(withoutIds(before))
    const b = (await loadBundle(after.projects[0].id))!
    expect(b.project.decisionProductId).toBe(b.products[0].id)
    expect(b.products[0].values).toEqual({ [b.properties[0].id]: 40 })
  })

  it('merges a single project as a copy with rewired references', async () => {
    const { project } = await seed()
    const file = (await exportProject(project.id))!
    const parsed = parseBackup(JSON.stringify(file))
    if (!parsed.ok) throw new Error('parse failed')
    await restoreMerge(parsed.file)

    const all = await db.projects.toArray()
    expect(all.map((p) => p.name).sort()).toEqual(['Küchenschrank', 'Küchenschrank (2)'])
    const copy = all.find((p) => p.name === 'Küchenschrank (2)')!
    const b = (await loadBundle(copy.id))!
    expect(b.project.decisionProductId).toBe(b.products[0].id)
    expect(b.requirements[0].condition).toMatchObject({ target: { kind: 'property', propertyId: b.properties[0].id } })
    expect(b.products[0].values).toEqual({ [b.properties[0].id]: 40 })
    expect(b.products[0].checks).toEqual({ [b.requirements[0].id]: 'pass' })
  })

  it('duplicates a project without sharing ids', async () => {
    const { project } = await seed()
    const id = (await duplicateProject(project.id, 'Kopie'))!
    const [a, b] = await Promise.all([loadBundle(project.id), loadBundle(id)])
    expect(b!.products[0].id).not.toBe(a!.products[0].id)
    expect(b!.products).toHaveLength(1)
  })

  it('rejects foreign or newer files', () => {
    expect(parseBackup('{"foo":1}')).toEqual({ ok: false, error: 'invalid' })
    expect(parseBackup('not json')).toEqual({ ok: false, error: 'invalid' })
    expect(parseBackup(JSON.stringify({ app: 'propario', schemaVersion: 99, projects: [], products: [] }))).toEqual({ ok: false, error: 'newer' })
  })

  it('accepts backups made before the rename to Propario', () => {
    expect(parseBackup(JSON.stringify({ app: 'produktvergleich', schemaVersion: 1, projects: [], products: [] }))).toMatchObject({ ok: true })
  })
})

describe('working together', () => {
  it('a shared comparison reaches the other person, and edits of different fields merge', async () => {
    const grace = server.person('Grace')
    const { project, product, depth } = await seed()
    setMember(server.db, ada.id, project.id, grace.id, 'editor')

    await grace.refresh()
    expect((await grace.cache.products.get(product.id))?.model).toBe('Arvika')

    // Both edit the same product at the same time, from caches that do not know the other's change.
    await ada.use()
    await updateProduct(product, { price: 450 })
    await grace.use()
    await setProductValue(product, depth.id, 38)
    await updateProduct(product, { model: 'Arvika II' })

    await ada.refresh()
    expect(await ada.cache.products.get(product.id)).toMatchObject({ price: 450, model: 'Arvika II', values: { [depth.id]: 38 } })
  })

  it('a viewer cannot change anything and the cache stays as the server has it', async () => {
    const grace = server.person('Grace')
    const { project, product } = await seed()
    setMember(server.db, ada.id, project.id, grace.id, 'viewer')
    await grace.refresh()
    await expect(updateProduct(product, { price: 1 })).rejects.toThrow('read only')
    expect((await grace.cache.products.get(product.id))?.price).toBe(499.99)
  })

  it('removing access removes the comparison from the other browser', async () => {
    const grace = server.person('Grace')
    const { project } = await seed()
    setMember(server.db, ada.id, project.id, grace.id, 'viewer')
    await grace.refresh()
    expect(await grace.cache.projects.count()).toBe(1)
    setMember(server.db, ada.id, project.id, grace.id, null)
    await grace.refresh()
    expect(await grace.cache.projects.count()).toBe(0)
    expect(await grace.cache.products.count()).toBe(0)
  })

  it('deletions reach other browsers', async () => {
    const grace = server.person('Grace')
    const { project, product } = await seed()
    setMember(server.db, ada.id, project.id, grace.id, 'editor')
    await grace.refresh()
    await ada.use()
    const { deleteProduct } = await import('../src/db/repo')
    await deleteProduct(product)
    await grace.refresh()
    expect(await grace.cache.products.get(product.id)).toBeUndefined()
    expect((await grace.cache.projects.get(project.id))?.decisionProductId).toBeNull()
  })
})
