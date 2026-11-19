// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/db'
import { makeProduct, makeProperty } from '../src/db/factories'
import { addProduct, addProperty, createProject, mergeProducts } from '../src/db/repo'
import { productTable } from '../src/domain/ai-export'
import { de } from '../src/i18n/de'
import { en } from '../src/i18n/en'
import { analyzeGrids, buildBundles } from '../src/import/excel'
import { planMerge } from '../src/import/merge'
import { textToGrids } from '../src/import/table-text'
import { testServer } from './helpers/server'

const width = makeProperty('p', { name: 'Breite', type: 'number', unit: 'cm' })
const open = makeProperty('p', { name: 'Offene Mitte', type: 'boolean' })
const arvika = makeProduct('p', { brand: 'Nordhaus', model: 'Arvika', price: 499, url: 'https://shop.example/arvika?utm_source=x', values: { [width.id]: 90 } })
const bo = makeProduct('p', { brand: 'Lund', model: 'Bo', gtin: '4006381333931', comments: 'Lieferzeit lang' })
const products = [arvika, bo]
const properties = [width, open]
const planOf = (text: string) => planMerge(textToGrids(text), products, properties)

describe('tables as text', () => {
  it('finds a Markdown table inside prose, with links, emphasis and escaped pipes', () => {
    const [grid] = textToGrids(
      'Gern, hier die Tabelle:\n\n| Modell | Preis | Notiz |\n|:--|--:|---|\n| **Arvika** | 499 € | a \\| b |\n| [Bo](https://shop.example/bo) | | |\n\nViel Erfolg!',
    )
    expect(grid.map((r) => r.map((c) => c?.w ?? ''))).toEqual([
      ['Modell', 'Preis', 'Notiz'],
      ['Arvika', '499 €', 'a | b'],
      ['Bo', '', ''],
    ])
    expect(grid[2][0]?.link).toBe('https://shop.example/bo')
  })

  it('reads CSV with semicolons and quotes, tab-separated text and JSON', () => {
    const csv = textToGrids('﻿Modell;Preis;Kommentar\r\nArvika;1.299,00;"sagt ""gut""; schön"\r\nBo;;"zwei\nZeilen"')[0]
    expect(csv[1].map((c) => c?.w ?? '')).toEqual(['Arvika', '1.299,00', 'sagt "gut"; schön'])
    expect(csv[2][2]?.w).toBe('zwei\nZeilen')
    expect(textToGrids('Modell\tPreis\nArvika\t499')[0][1][1]?.w).toBe('499')
    const json = textToGrids('```json\n{"products":[{"Modell":"Arvika","Preis":499},{"Modell":"Bo","Breite":80}]}\n```')[0]
    expect(json[0].map((c) => c?.w)).toEqual(['Modell', 'Preis', 'Breite'])
    expect(json[2][2]?.v).toBe(80)
    expect(textToGrids('Nur ein Satz, keine Tabelle.')).toEqual([])
  })
})

describe('a new comparison from a text table', () => {
  it('imports CSV like an Excel sheet, named after the file', () => {
    const grids = Object.fromEntries(textToGrids('Modell;Preis;Breite (cm)\nArvika;499;90\nBo;1.299,00;120').map((g) => ['Regale', g]))
    const [bundle] = buildBundles(analyzeGrids(grids, 'Regale.csv', { people: [] }))
    expect(bundle.project.name).toBe('Regale')
    expect(bundle.products.map((p) => [p.model, p.price])).toEqual([
      ['Arvika', 499],
      ['Bo', 1299],
    ])
    expect(bundle.properties[0]).toMatchObject({ name: 'Breite', unit: 'cm', type: 'number' })
  })
})

describe('merging a table into a comparison', () => {
  it('reads its own export back without a change, in both languages', () => {
    for (const m of [de, en]) {
      const plan = planOf(productTable({ products, properties }, m).join('\n'))
      expect(plan?.items.map((i) => i.kind)).toEqual(['same', 'same'])
      expect(plan?.newFields).toEqual([])
    }
  })

  it('updates the products it finds by link, GTIN or name, and adds the others', () => {
    const plan = planOf(
      [
        '| Link | Marke | Modell | Preis | Breite (mm) | Offene Mitte | Material |',
        '|---|---|---|---|---|---|---|',
        '| https://shop.example/arvika | | | 459 | 900 | ja | |',
        '| | Lund | Bo | | 800 | | Eiche |',
        '| https://shop.example/cleo | Lund | Cleo | 799 | 1000 | nein | Buche |',
      ].join('\n'),
    )!
    const [a, b, c] = plan.items
    // Same link despite the tracking parameter; millimetres converted into the field's centimetres.
    expect(a).toMatchObject({ kind: 'update', existing: arvika, patch: { price: 459, values: { [open.id]: true } } })
    expect(b.existing).toBe(bo)
    expect(b.patch.values).toEqual({ [width.id]: 80, 'new:6': 'Eiche' })
    expect(c).toMatchObject({ kind: 'new', incoming: { model: 'Cleo', price: 799, url: 'https://shop.example/cleo' } })
    expect(c.incoming.values).toEqual({ [width.id]: 100, [open.id]: false, 'new:6': 'Buche' })
    expect(plan.newFields).toEqual([expect.objectContaining({ key: 'new:6', name: 'Material', type: 'text' })])
  })

  it('never clears a value and adds to texts instead of replacing them', () => {
    const plan = planOf('| Modell | Preis | Kommentar | Breite |\n|---|---|---|---|\n| Arvika | | | |\n| Bo | | Gibt es auch in Weiß | |')!
    expect(plan.items[0].kind).toBe('same')
    expect(plan.items[1].patch).toEqual({ comments: 'Lieferzeit lang\nGibt es auch in Weiß' })
    // Saying the same again is no change.
    expect(planOf('| Modell | Kommentar |\n|---|---|\n| Bo | lieferzeit lang |')!.items[0].kind).toBe('same')
  })

  it('finds a product by GTIN and by model alone when the table has no brand', () => {
    const plan = planOf('| GTIN | Modell | Preis |\n|---|---|---|\n| 4006381333931 | Bo 2 | 199 |\n|  | Arvika | 479 |')!
    expect(plan.items.map((i) => i.existing)).toEqual([bo, arvika])
    expect(plan.items[0].patch).toMatchObject({ model: 'Bo 2', price: 199 })
  })

  it('says so when there is no product table', () => {
    expect(planOf('Arvika ist am besten, weil es am günstigsten ist.')).toBeNull()
  })
})

describe('applying a merge', () => {
  beforeEach(async () => {
    await testServer().person('Ada', true).use()
  })

  it('creates the new fields, adds products found by the person and patches only the changed values', async () => {
    const project = await createProject({ name: 'Regal' })
    const w = await addProperty(project.id, { name: 'Breite', type: 'number', unit: 'cm' })
    const depth = await addProperty(project.id, { name: 'Tiefe', type: 'number', unit: 'cm' })
    const a = await addProduct(project.id, { model: 'Arvika', price: 499, values: { [w.id]: 90, [depth.id]: 38 } })
    const plan = planMerge(
      textToGrids('| Modell | Preis | Breite | Material |\n|---|---|---|---|\n| Arvika | 459 | 95 | Eiche |\n| Cleo | 799 | 100 | Buche |'),
      [a],
      [w, depth],
    )!
    await mergeProducts(
      project.id,
      plan.newFields,
      plan.items.filter((i) => i.kind === 'new').map((i) => i.incoming),
      plan.items.filter((i) => i.kind === 'update').map((i) => ({ product: i.existing!, patch: i.patch })),
    )
    const fields = await db.properties.where('projectId').equals(project.id).sortBy('order')
    const material = fields.find((f) => f.name === 'Material')!
    expect(fields.map((f) => f.name)).toEqual(['Breite', 'Tiefe', 'Material'])
    const all = await db.products.where('projectId').equals(project.id).sortBy('order')
    expect(all.map((p) => p.model)).toEqual(['Arvika', 'Cleo'])
    expect(all[0]).toMatchObject({ price: 459, values: { [w.id]: 95, [depth.id]: 38, [material.id]: 'Eiche' } })
    expect(all[0].priceDate).not.toBe('')
    expect(all[1]).toMatchObject({ projectId: project.id, foundBy: 'Ada', price: 799, values: { [w.id]: 100, [material.id]: 'Buche' } })
  })
})
