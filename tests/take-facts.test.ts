// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/db'
import { addProduct, addProperty, createProject, takeFacts, updateProduct } from '../src/db/repo'
import { activeMessages } from '../src/i18n/active'
import { testServer } from './helpers/server'

beforeEach(async () => {
  const server = testServer()
  await server.person('Ada', true).use()
})

describe('adding a product and taking its shop page', () => {
  it('names whoever added the product as its finder', async () => {
    const project = await createProject({ name: 'Schrank' })
    expect((await addProduct(project.id, { model: 'Arvika' })).foundBy).toBe('Ada')
    expect((await addProduct(project.id, { model: 'Bo', foundBy: 'Grace' })).foundBy).toBe('Grace')
  })

  it('fills empty fields through the server and creates each new field once, also for products loading together', async () => {
    const project = await createProject({ name: 'Schrank' })
    const color = await addProperty(project.id, { name: 'Farbe', type: 'text' })
    const a = await addProduct(project.id, { url: 'https://shop.example/a' })
    const b = await addProduct(project.id, { url: 'https://shop.example/b', variant: 'Eigene Farbe' })
    const page = { brand: 'Nordhaus', name: 'Nordhaus Arvika', category: 'Kleiderschränke', color: 'Eiche', specs: [{ name: 'Breite', value: '600 mm' }] }

    const [filledA] = await Promise.all([takeFacts(a, page), takeFacts(b, page)])
    // New fields are named in the interface language.
    const widthName = activeMessages().pageImport.width
    expect(filledA).toEqual(['brand', 'model', 'productType', 'variant', 'Farbe', widthName])

    const props = await db.properties.where('projectId').equals(project.id).toArray()
    const width = props.filter((p) => p.name === widthName)
    expect(width).toHaveLength(1)
    expect(width[0]).toMatchObject({ type: 'number', unit: 'cm' })

    const [pa, pb] = await Promise.all([db.products.get(a.id), db.products.get(b.id)])
    expect(pa).toMatchObject({ brand: 'Nordhaus', model: 'Arvika', productType: 'Kleiderschränke', variant: 'Eiche' })
    expect(pa!.values).toEqual({ [color.id]: 'Eiche', [width[0].id]: 60 })
    expect(pb!.variant).toBe('Eigene Farbe')
    expect(pb!.values[width[0].id]).toBe(60)
  })

  it('leaves values someone entered in the meantime alone', async () => {
    const project = await createProject({ name: 'Schrank' })
    const stale = await addProduct(project.id, {})
    await updateProduct(stale, { model: 'Mein Name', price: 5 })
    await takeFacts(stale, { name: 'Shop Name', price: 99 })
    expect(await db.products.get(stale.id)).toMatchObject({ model: 'Mein Name', price: 5 })
  })
})
