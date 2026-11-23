/**
 * Importer tests with synthetic workbooks that mirror the two real layouts:
 * (1) one sheet per comparison, header in row 1, free-form sections below the products;
 * (2) products and requirements on separate sheets, title rows above the header, HYPERLINK formulas.
 */
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { analyzeWorkbook, buildBundles, readWorkbook } from '../src/import/excel'
import { bundleToWorkbook } from '../src/export/xlsx'
import { summarize } from '../src/domain/requirements'
import { en } from '../src/i18n/en'
import { de } from '../src/i18n/de'

const people = ['Ada', 'Grace', 'ChatGPT']

function toBytes(wb: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

function legacyWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const fridge = XLSX.utils.aoa_to_sheet([
    ['Anbieter', 'System', 'Abmaße cm (BxHxT)', 'Gewicht kg', 'No Frost', 'Auswahl', 'Preis', 'Gekauft', 'Kommentar', 'Punkte', 'Grace', 'Link'],
    ['Frostel', 'FK 100', '60 x 185 x 60,5', 62, 'nein', 'ja', 399, new Date(2024, 4, 14), 'Maße gut', 7, 'okay', 'https://example.org/frostel'],
    ['Kaltmann', 'KM 2', '60 x 200 x 68', 74, 'Ja', 'nein', '1,500 €', null, 'zu tief', 5, null, null],
    ['Polaris', 'PX 4', '60 x 190 x 62', '68 (netto)', 'Ja', null, '830 – 900 €', 'Mai 2019', null, null, null, null],
    [],
    ['Anforderungen'],
    ['Must Have', 'Gefrierfach, leise'],
    ['Should have', 'Nofrost'],
    ['Nice to have'],
    ['Preisrange', '1,000€'],
    ['Gewicht max.', 70],
    [],
    ['Aktuelles System'],
    ['Links'],
    ['https://example.org/test'],
  ])
  // A hyperlink on the model name is the product page.
  fridge['B3'].l = { Target: 'https://example.org/kaltmann' }
  XLSX.utils.book_append_sheet(wb, fridge, 'Kühlschrank')

  const laptop = XLSX.utils.aoa_to_sheet([
    ['Hersteller', 'System', 'Zoll', 'RAM (GB)', 'Auswahl', 'Preis', 'Gekauft', 'Nutzer', 'Kommentar', 'Link'],
    ['Nordwind', 'Air 14', 14, 16, 'ja', 1000, null, 'Ada', 'gut', null],
    ['Kestrel', 'Pro 13', 13, 8, null, null, null, 'Grace', null, null],
    [],
    ['Anforderungen'],
    ['Grace', null, 'Ada'],
    ['Fotos sortieren', null, 'USB4'],
    ['max. 1000€'],
    ['Aktuelles System'],
  ])
  XLSX.utils.book_append_sheet(wb, laptop, 'Notebook')
  return wb
}

function separateSheetsWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const products = XLSX.utils.aoa_to_sheet([
    [],
    [null, 'Regal-Suche: alle Modelle'],
    [null, '3 erfasste Modelle'],
    [],
    [
      'ID',
      'Modell',
      'Möbelart',
      'Einschätzung',
      'Favoritenrang',
      'Gefunden von',
      'Marke',
      'Händler',
      'Breite (cm)',
      'Tiefe (cm)',
      'Freie Fachhöhe (cm)',
      'Tiefe ≤ 45',
      'Preis (€)',
      'Produktlink',
    ],
    [1, 'Fjella', 'Vitrine', 'Favorit', 1, 'Ada', 'Holm', 'Möbelhaus A', 90, 42, 30, 'Ja', 449.99, 'Produktseite öffnen'],
    [2, 'Birk', 'Buffet', 'Kompromiss', null, 'ChatGPT', 'Versand B', 'Versand B', 75, 38, null, 'Ja', 329.99, 'Produktseite öffnen'],
    [3, 'Oskar', 'Schrank', 'Ausgeschieden', null, 'Grace', 'Laden C', 'Laden C', 130, 50, 33, 'Nein', 1199, null],
  ])
  products['N6'].f = 'HYPERLINK("https://example.org/fjella","Produktseite öffnen")'
  products['B7'].f = 'HYPERLINK("https://example.org/birk","Birk")'
  XLSX.utils.book_append_sheet(wb, products, 'Alle Möbel')
  const reqs = XLSX.utils.aoa_to_sheet([
    ['Anforderungen an das neue Regal'],
    [],
    ['Kategorie', 'Anforderung', 'Priorität', 'Details / Begründung'],
    ['Maße', 'Maximale Tiefe', 'MUSS', 'Maximal 45 cm.'],
    ['Maße', 'Bevorzugte Breite', 'WUNSCH', 'Ideal bis 100 cm; äußerste Grenze 110 cm.'],
    ['Stauraum', 'Freie Fachhöhe', 'MUSS', 'Mindestens 25 cm.'],
    ['Design', 'Hochglanz', 'VERMEIDEN', 'Zu empfindlich.'],
    ['Referenz', 'Modell Vega', 'POSITIV', 'Form interessant.'],
  ])
  XLSX.utils.book_append_sheet(wb, reqs, 'Anforderungen')
  return wb
}

describe('legacy layout (one sheet per comparison)', () => {
  const draft = analyzeWorkbook(readWorkbook(toBytes(legacyWorkbook())), 'Vergleiche.xlsx', { people })
  const bundles = buildBundles(draft)
  const fridge = bundles.find((b) => b.project.name === 'Kühlschrank')!

  it('creates one project per sheet and stops product rows at the sections', () => {
    expect(bundles.map((b) => b.project.name)).toEqual(['Kühlschrank', 'Notebook'])
    expect(fridge.products).toHaveLength(3)
  })

  it('maps standard columns and keeps everything else as fields', () => {
    const sheet = draft.sheets[0]
    const target = Object.fromEntries(sheet.columns.map((c) => [c.header, c.target]))
    expect(target).toMatchObject({
      Anbieter: 'brand',
      System: 'model',
      Auswahl: 'candidate',
      Preis: 'price',
      Gekauft: 'purchaseDate',
      Kommentar: 'comments',
      Grace: 'personNote',
      Link: 'url',
      Punkte: 'property',
    })
    const weight = fridge.properties.find((p) => p.name === 'Gewicht')!
    expect(weight).toMatchObject({ type: 'number', unit: 'kg' })
    expect(fridge.properties.find((p) => p.name === 'No Frost')!.type).toBe('boolean')
  })

  it('reads products including links, prices, purchases and notes', () => {
    const [frostel, kaltmann, polaris] = fridge.products
    // A favourite in the sheet is checked, with the star.
    expect(frostel).toMatchObject({ brand: 'Frostel', price: 399, candidate: 'checked', favorite: true, url: 'https://example.org/frostel' })
    expect(frostel.purchase).toMatchObject({ status: 'purchased', date: '2024-05-14' })
    expect(frostel.ratings).toEqual([{ person: 'Grace', stars: null, note: 'okay' }])
    expect(kaltmann).toMatchObject({ price: 1500, candidate: 'excluded', url: 'https://example.org/kaltmann' })
    expect(polaris).toMatchObject({ price: 830, priceNote: '830 – 900 €' })
    expect(polaris.purchase).toMatchObject({ status: 'purchased', note: 'Mai 2019' })
    // A value that does not fit the number field is kept as text.
    const weight = fridge.properties.find((p) => p.name === 'Gewicht')!
    expect(polaris.values[weight.id]).toBe('68 (netto)')
    expect(fridge.project.status).toBe('purchased')
  })

  it('turns the free-form block into requirements and notes', () => {
    const labels = fridge.requirements.map((r) => [r.priority, r.label])
    expect(labels).toEqual([
      ['must', 'Gefrierfach, leise'],
      ['important', 'Nofrost'],
      ['important', 'Preisrange'],
      ['important', 'Gewicht max.'],
    ])
    expect(fridge.requirements[2].condition).toEqual({ target: { kind: 'price' }, op: 'lte', value: 1000 })
    const weight = fridge.properties.find((p) => p.name === 'Gewicht')!
    expect(fridge.requirements[3].condition).toEqual({ target: { kind: 'property', propertyId: weight.id }, op: 'lte', value: 70 })
    expect(fridge.project.notes).toContain('Aktuelles System')
    expect(fridge.project.notes).toContain('https://example.org/test')
  })

  it('splits requirement columns per person', () => {
    const nb = bundles.find((b) => b.project.name === 'Notebook')!
    expect(nb.requirements.map((r) => `${r.category}: ${r.label}`)).toEqual(['Grace: Fotos sortieren', 'Ada: USB4', 'Grace: Budget'])
    expect(nb.requirements[2].condition).toEqual({ target: { kind: 'price' }, op: 'lte', value: 1000 })
  })
})

describe('separate products and requirements sheets', () => {
  const draft = analyzeWorkbook(readWorkbook(toBytes(separateSheetsWorkbook())), 'Regal.xlsx', { people })
  const bundles = buildBundles(draft)
  const b = bundles[0]

  it('detects header below title rows and merges the requirement sheet', () => {
    expect(draft.sheets.map((s) => s.kind)).toEqual(['products', 'requirements'])
    expect(draft.sheets[0].headerRow).toBe(4)
    expect(bundles).toHaveLength(1)
    expect(b.project.name).toBe('Regal')
    expect(b.products).toHaveLength(3)
    expect(b.requirements).toHaveLength(5)
  })

  it('reads favourites, exclusions, HYPERLINK formulas and keeps unknown values', () => {
    const [fjella, birk, oskar] = b.products
    expect(fjella).toMatchObject({
      candidate: 'checked',
      favorite: true,
      favoriteRank: 1,
      foundBy: 'Ada',
      url: 'https://example.org/fjella',
      productType: 'Vitrine',
    })
    expect(birk).toMatchObject({ candidate: 'open', url: 'https://example.org/birk' })
    // Unknown assessment and a link label without target are kept, not dropped.
    expect(birk.extra).toEqual({ Einschätzung: 'Kompromiss', Produktlink: 'Produktseite öffnen' })
    expect(oskar.candidate).toBe('excluded')
  })

  it('maps priorities and derives checkable rules', () => {
    const byLabel = Object.fromEntries(b.requirements.map((r) => [r.label, r]))
    expect(byLabel['Maximale Tiefe'].priority).toBe('must')
    expect(byLabel['Hochglanz'].priority).toBe('avoid')
    expect(byLabel['Modell Vega'].priority).toBe('info')
    const depth = b.properties.find((p) => p.name === 'Tiefe')!
    const shelf = b.properties.find((p) => p.name === 'Freie Fachhöhe')!
    expect(byLabel['Maximale Tiefe'].condition).toEqual({ target: { kind: 'property', propertyId: depth.id }, op: 'lte', value: 45 })
    expect(byLabel['Freie Fachhöhe'].condition).toEqual({ target: { kind: 'property', propertyId: shelf.id }, op: 'gte', value: 25 })

    const props = new Map(b.properties.map((p) => [p.id, p]))
    const [fjella, birk, oskar] = b.products.map((p) => summarize(b.requirements, p, props))
    expect(fjella).toMatchObject({ qualified: true, blocked: false })
    expect(birk).toMatchObject({ qualified: false, blocked: false }) // shelf height unknown
    expect(oskar).toMatchObject({ blocked: true }) // 50 cm deep
  })
})

describe('Excel export round trip', () => {
  for (const [name, m] of [
    ['English', en],
    ['German', de],
  ] as const) {
    it(`re-imports its own ${name} export`, () => {
      const original = buildBundles(analyzeWorkbook(readWorkbook(toBytes(separateSheetsWorkbook())), 'Regal.xlsx', { people }))[0]
      const exported = bundleToWorkbook(original, m)
      const again = buildBundles(analyzeWorkbook(readWorkbook(toBytes(exported)), 'Regal.xlsx', { people }))[0]
      expect(again.products.map((p) => [p.brand, p.model, p.price, p.candidate, p.url])).toEqual(
        original.products.map((p) => [p.brand, p.model, p.price, p.candidate, p.url]),
      )
      expect(again.properties.map((p) => [p.name, p.type, p.unit])).toEqual(original.properties.map((p) => [p.name, p.type, p.unit]))
      expect(again.requirements.map((r) => [r.label, r.priority, r.condition?.op ?? null])).toEqual(
        original.requirements.map((r) => [r.label, r.priority, r.condition?.op ?? null]),
      )
    })
  }
})
