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
  changeOffers,
  setProductValue,
  updateProduct,
} from '../src/db/repo'
import { newId } from '../src/shared/ids'
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

  it('exports a selection: only those products, no decision or reference pointing elsewhere, and it imports', async () => {
    const { project, product } = await seed()
    const other = await addProduct(project.id, { brand: 'Fjell', model: 'Kanto', price: 549 })
    const third = await addProduct(project.id, { brand: 'Studio Verde', model: 'Linea', price: 779 })
    await db.projects.update(project.id, { priceReference: other.id })

    const file = (await exportProject(project.id, undefined, new Set([other.id, third.id])))!
    expect(file.products.map((p) => p.model)).toEqual(['Kanto', 'Linea'])
    expect(file.projects[0].decisionProductId).toBeNull()
    expect(file.projects[0].priceReference).toBe(other.id)
    expect(file.properties).toHaveLength(1)
    expect(file.requirements).toHaveLength(1)

    const kept = (await exportProject(project.id, undefined, new Set([product.id])))!
    expect(kept.projects[0].decisionProductId).toBe(product.id)
    expect(kept.projects[0].priceReference).toBe('')

    const parsed = parseBackup(JSON.stringify(file))
    if (!parsed.ok) throw new Error('parse failed')
    await restoreMerge(parsed.file)
    const copy = (await db.projects.toArray()).find((p) => p.name === 'Küchenschrank (2)')!
    const b = (await loadBundle(copy.id))!
    expect(b.products.map((p) => p.model)).toEqual(['Kanto', 'Linea'])
    expect(b.project.priceReference).toBe(b.products.find((p) => p.model === 'Kanto')!.id)
    expect(b.project.decisionProductId).toBeNull()
  })

  it('duplicates a project without sharing ids', async () => {
    const { project, product } = await seed()
    const [who, gone] = [newId(), newId()]
    await db.projects.update(project.id, { priceReference: product.id, rankings: { [who]: { order: [product.id, gone], settled: 1, next: 1 } } })
    const id = (await duplicateProject(project.id, 'Kopie'))!
    const [a, b] = await Promise.all([loadBundle(project.id), loadBundle(id)])
    expect(b!.products[0].id).not.toBe(a!.products[0].id)
    expect(b!.products).toHaveLength(1)
    // The price reference and the duel rankings point at the copy's own product.
    expect(b!.project.priceReference).toBe(b!.products[0].id)
    expect(b!.project.rankings).toEqual({ [who]: { order: [b!.products[0].id, gone], settled: 1, next: 1 } })
  })

  it('keeps offers, outside ratings and purchase dates through the server and a backup', async () => {
    const { project, product } = await seed()
    const stored = (await db.products.get(product.id))!
    await changeOffers(stored, () => [
      { id: newId(), shop: 'Shop A', price: 489, shipping: 19, date: '2026-11-10', url: 'https://a.example/p' },
      { id: newId(), shop: 'Shop B', price: 499, shipping: 0, date: '2026-11-12', url: '' },
    ])
    let p = (await db.products.get(product.id))!
    // The cheapest total becomes the product's price, its date and shop.
    expect(p).toMatchObject({ price: 499, priceDate: '2026-11-12', retailer: 'Shop B' })
    await updateProduct(p, {
      reviews: [{ id: newId(), source: 'Amazon', about: 'product', value: 4.4, scale: 'stars5', count: 812, date: '2026-11-12', url: '' }],
      purchase: { ...p.purchase, status: 'purchased', date: '2026-11-13', returnUntil: '2026-11-27', warrantyUntil: '2028-11-13' },
    })

    const file = parseBackup(JSON.stringify(await exportProject(project.id)))
    if (!file.ok) throw new Error('parse failed')
    await deleteProject(project.id)
    await restoreReplace(file.file)
    p = (await db.products.toArray())[0]
    expect(p.offers.map((o) => o.shop)).toEqual(['Shop A', 'Shop B'])
    expect(p.reviews[0]).toMatchObject({ source: 'Amazon', value: 4.4, count: 812 })
    expect(p.purchase).toMatchObject({ returnUntil: '2026-11-27', warrantyUntil: '2028-11-13' })
  })

  it('keeps marked views per side through the server, and drops them with pictures that cannot come along', async () => {
    const { project, product } = await seed()
    const pic = '/api/images/00000000-0000-4000-8000-0000000000aa'
    const crop = { x: 0.1, y: 0.05, w: 0.8, h: 0.9 }
    await updateProduct((await db.products.get(product.id))!, { image: pic, views: { front: { src: pic, crop } } })
    // Moving the mark to another side: one side removed, one set – merged per side.
    await updateProduct((await db.products.get(product.id))!, { views: { front: null, side: { src: pic, crop: null } } } as never)
    expect((await db.products.get(product.id))!.views).toEqual({ side: { src: pic, crop: null } })

    // The picture of this made-up path cannot be copied: the product comes back, the mark does not.
    const file = parseBackup(JSON.stringify(await exportProject(project.id)))
    if (!file.ok) throw new Error('parse failed')
    await deleteProject(project.id)
    await restoreReplace(file.file)
    const p = (await db.products.toArray())[0]
    expect(p.model).toBe('Arvika')
    expect(p.views).toEqual({})
  })

  it('quick edits of several offers do not undo each other', async () => {
    const { product } = await seed()
    const stale = (await db.products.get(product.id))!
    const a = newId()
    const b = newId()
    // Three edits fired at once from the same (stale) render, as when tabbing through fields.
    await Promise.all([
      changeOffers(stale, (l) => [...l, { id: a, shop: 'A', price: null, shipping: null, date: '', url: '' }]),
      changeOffers(stale, (l) => [...l, { id: b, shop: 'B', price: null, shipping: null, date: '', url: '' }]),
      changeOffers(stale, (l) => l.map((o) => (o.id === a ? { ...o, price: 10 } : o))),
    ])
    const p = (await db.products.get(product.id))!
    expect(p.offers.map((o) => [o.shop, o.price])).toEqual([
      ['A', 10],
      ['B', null],
    ])
    expect(p.price).toBe(10)
  })

  it('restores backups from before offers and ratings existed', async () => {
    const { project } = await seed()
    const file = (await exportProject(project.id))!
    for (const p of file.products as unknown as Record<string, unknown>[]) {
      delete p.offers
      delete p.reviews
      delete p.gtin
    }
    const parsed = parseBackup(JSON.stringify(file))
    if (!parsed.ok) throw new Error('parse failed')
    await deleteProject(project.id)
    await restoreReplace(parsed.file)
    const p = (await db.products.toArray())[0]
    expect(p).toMatchObject({ offers: [], reviews: [], model: 'Arvika' })
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
