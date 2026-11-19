import { describe, expect, it } from 'vitest'
import { makeProduct, makeProperty } from '../src/db/factories'
import { convert, planFacts, splitDimensions } from '../src/domain/page-import'
import { cleanFacts } from '../src/shared/product-facts'

const props = () => [
  makeProperty('p', { name: 'Breite', type: 'number', unit: 'cm' }),
  makeProperty('p', { name: 'Farbe', type: 'text' }),
  makeProperty('p', { name: 'Montage', type: 'boolean' }),
  makeProperty('p', { name: 'Stil', type: 'select', options: ['Modern', 'Landhaus'] }),
]

describe('planFacts: what a shop page fills in', () => {
  it('fills the product fields and matching fields, converting units', () => {
    const [width, color, assembly, style] = props()
    const plan = planFacts(
      makeProduct('p'),
      {
        name: 'Nordhaus Arvika 2-türig',
        brand: 'Nordhaus',
        category: 'Kleiderschränke',
        color: 'Eiche',
        specs: [
          { name: 'Width', value: '600', unit: 'mm' },
          { name: 'Montage erforderlich', value: 'ja' },
          { name: 'montage', value: 'Ja' },
          { name: 'Stil', value: 'modern' },
        ],
      },
      [width, color, assembly, style],
    )
    expect(plan.patch).toMatchObject({ brand: 'Nordhaus', model: 'Arvika 2-türig', productType: 'Kleiderschränke', variant: 'Eiche' })
    expect(plan.patch.values).toEqual({ [width.id]: 60, [color.id]: 'Eiche', [assembly.id]: true, [style.id]: 'Modern' })
    expect(plan.filled).toEqual(expect.arrayContaining(['brand', 'model', 'productType', 'variant', 'Breite', 'Farbe']))
  })

  it('never overwrites what someone entered', () => {
    const [width, color] = props()
    const p = makeProduct('p', { brand: 'Eigen', model: 'Mein Name', price: 10, values: { [width.id]: 55 } })
    const plan = planFacts(p, { brand: 'Shop', name: 'Shop Name', price: 99, color: 'Weiß', specs: [{ name: 'Breite', value: '60 cm' }] }, [width, color])
    expect(plan.patch.brand).toBeUndefined()
    expect(plan.patch.model).toBeUndefined()
    expect(plan.patch.price).toBeUndefined()
    expect(plan.patch.values).toEqual({ [color.id]: 'Weiß' })
  })

  it('creates fields for width, height, depth and weight only, from labelled combined dimensions', () => {
    const plan = planFacts(
      makeProduct('p'),
      {
        specs: [
          { name: 'Maße (B x H x T)', value: '60 x 180 x 55,5 cm' },
          { name: 'Gewicht', value: '42 kg' },
        ],
      },
      [],
    )
    expect(plan.create).toEqual([
      { dimension: 'width', value: 60 },
      { dimension: 'height', value: 180 },
      { dimension: 'depth', value: 55.5 },
      { dimension: 'weight', value: 42 },
    ])
  })

  it('reads a furniture data sheet: H/B/T with slashes, "Gesamtgewicht ca.", colour as variant, shop lines left out', () => {
    // Structure as seen on a furniture shop (2026-11), values invented.
    const plan = planFacts(
      makeProduct('p'),
      {
        specs: [
          { name: 'Farbe', value: 'weiß/braun', table: true },
          { name: 'Abmessungen', value: 'H/B/T ca. 190/60/40 cm', table: true },
          { name: 'Fach links', value: 'H/B/T ca. 40/20/30 cm', table: true },
          { name: 'Gewicht', value: 'Gesamtgewicht ca. 50 kg', table: true },
          { name: 'Finish', value: 'gewachst', table: true },
          { name: 'Hersteller', value: 'Firma, Straße 1, 12345 Stadt', table: true },
          { name: 'Pflegehinweis', value: 'Belastbarkeit: ca. 300 kg', table: true },
        ],
      },
      [],
    )
    expect(plan.patch.variant).toBe('weiß/braun')
    expect(plan.create).toEqual([
      { dimension: 'height', value: 190 },
      { dimension: 'width', value: 60 },
      { dimension: 'depth', value: 40 },
      { dimension: 'weight', value: 50 },
    ])
    expect(plan.patch.extra).toEqual({ Abmessungen: 'H/B/T ca. 190/60/40 cm', 'Fach links': 'H/B/T ca. 40/20/30 cm', Finish: 'gewachst' })
  })

  it('leaves out dimensions the page contradicts, placeholders of 0 and shop or cookie lines', () => {
    // Patterns seen on real shop pages (2026-11), values invented.
    const plan = planFacts(
      makeProduct('p'),
      {
        specs: [
          { name: 'Breite', value: '384', unit: 'mm', table: true },
          { name: 'Höhe', value: '900', unit: 'mm', table: true },
          { name: 'Stellfläche in cm', value: '90x38,4x190 (BxTxH)', table: true },
          { name: 'Gewicht', value: '0', unit: 'kg' },
          { name: 'Zweck', value: 'Speichert die Cookie-Einstellungen', table: true },
          { name: 'Anbieter', value: 'Werbefirma GmbH', table: true },
          { name: 'Holzart', value: 'Kiefer', table: true },
        ],
      },
      [],
    )
    // Width and height disagree within the page: none. Depth is stated once (38,4 from the combined line): kept.
    expect(plan.create).toEqual([{ dimension: 'depth', value: 38.4 }])
    expect(plan.patch.extra).toEqual({ 'Stellfläche in cm': '90x38,4x190 (BxTxH)', Holzart: 'Kiefer' })
  })

  it('leaves a dimension out when the page names two different values (e.g. a size variant)', () => {
    const plan = planFacts(
      makeProduct('p'),
      {
        specs: [
          { name: 'Breite', value: '130', unit: 'cm', table: true },
          { name: 'Höhe', value: '196', unit: 'cm', table: true },
          { name: 'Breite', value: '100', unit: 'cm', table: true },
        ],
      },
      [],
    )
    expect(plan.create).toEqual([{ dimension: 'height', value: 196 }])
  })

  it('does not guess: unlabelled dimensions, unknown units and odd values stay out', () => {
    const [width] = props()
    const plan = planFacts(
      makeProduct('p'),
      {
        specs: [
          { name: 'Maße', value: '60 x 180 x 55 cm' },
          { name: 'Breite', value: '24 Zoll' },
          { name: 'Höhe', value: 'variabel' },
        ],
      },
      [width],
    )
    expect(plan.patch.values).toBeUndefined()
    expect(plan.create).toEqual([])
  })

  it('keeps other lines as extras, but not lines about the shop', () => {
    const plan = planFacts(
      makeProduct('p'),
      {
        specs: [
          { name: 'Energieeffizienzklasse', value: 'A' },
          { name: 'Versandkosten', value: '4,95 €', table: true },
        ],
      },
      [],
    )
    expect(plan.patch.extra).toEqual({ Energieeffizienzklasse: 'A' })
  })

  it('works on records from before fields were added', () => {
    const old = { ...makeProduct('p') } as Record<string, unknown>
    delete old.gtin
    delete old.extra
    expect(planFacts(old as never, { gtin: '4006381333931', specs: [{ name: 'Motor', value: '2 kW' }] }, []).patch).toMatchObject({
      gtin: '4006381333931',
      extra: { Motor: '2 kW' },
    })
  })
})

describe('helpers', () => {
  it('converts only within lengths or masses', () => {
    expect(convert(600, 'mm', 'cm')).toBe(60)
    expect(convert(1.85, 'm', 'cm')).toBe(185)
    expect(convert(4200, 'g', 'kg')).toBe(4.2)
    expect(convert(5, 'kg', 'cm')).toBeNull()
  })

  it('splits labelled dimensions in either form', () => {
    expect(splitDimensions({ name: 'Abmessungen', value: 'B 60 x H 180 x T 55 cm' }).map((s) => [s.name, s.value])).toEqual([
      ['width', '60'],
      ['height', '180'],
      ['depth', '55'],
    ])
    expect(splitDimensions({ name: 'Size (W x D)', value: '120 x 80', unit: 'cm' }).map((s) => s.name)).toEqual(['width', 'depth'])
  })

  it('cleans page text: one line, bounded, descriptions cut at a word', () => {
    const f = cleanFacts({
      name: 'Arvika\n\t2',
      brand: 'x'.repeat(101),
      description: 'Wort '.repeat(400),
      specs: [
        { name: 'A', value: '' },
        { name: 'B', value: 1 },
      ],
    })
    expect(f.name).toBe('Arvika 2')
    expect(f.brand).toBeUndefined()
    expect(f.description!.length).toBeLessThanOrEqual(1002)
    expect(f.description!.endsWith(' …')).toBe(true)
    expect(f.specs).toEqual([{ name: 'B', value: '1' }])
  })
})

describe('a second picture from the shop page', () => {
  it('finds a drawing named as such, never the main picture again', async () => {
    const { furtherCandidates } = await import('../src/domain/pictures')
    const main = 'https://cdn.shop.example/p/arvika-front.jpg?w=800'
    const gallery = [
      'https://cdn.shop.example/p/arvika-front.jpg?w=400',
      'https://cdn.shop.example/p/arvika-side.jpg',
      'https://cdn.shop.example/p/arvika-masszeichnung.jpg',
    ]
    expect(furtherCandidates(gallery, main).named).toBe('https://cdn.shop.example/p/arvika-masszeichnung.jpg')
    expect(furtherCandidates(gallery.slice(0, 2), main)).toEqual({ named: null, others: ['https://cdn.shop.example/p/arvika-side.jpg'] })
    // "Massivholz" is no dimension drawing.
    expect(furtherCandidates(['https://x.example/massivholz-schrank.jpg'], main).named).toBeNull()
    expect(furtherCandidates([gallery[0]], main).others).toEqual([])
  })
})

describe('telling a dimension drawing by its pixels', () => {
  /** A 100×100 picture painted by a function of (x, y) → [r, g, b]. */
  const paint = (f: (x: number, y: number) => [number, number, number]) => {
    const a = new Uint8ClampedArray(100 * 100 * 4)
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) {
        const [r, g, b] = f(x, y)
        a.set([r, g, b, 255], (y * 100 + x) * 4)
      }
    return a
  }
  const white: [number, number, number] = [255, 255, 255]

  it('says yes to thin dark lines on white, no to photographed objects', async () => {
    const { looksLikeDrawing, pixelStats } = await import('../src/domain/pictures')
    // Outline of a cabinet with a dimension line: 1-px dark strokes on white.
    const drawing = paint((x, y) =>
      ((x === 20 || x === 80) && y > 10 && y < 90) || ((y === 10 || y === 90) && x >= 20 && x <= 80) || (y === 95 && x > 20 && x < 80) ? [40, 40, 40] : white,
    )
    // Wooden cabinet on white: a brown block.
    const wood = paint((x, y) => (x > 25 && x < 75 && y > 10 && y < 90 ? [150, 100, 60] : white))
    // White cabinet on white: a block of soft grey shading.
    const whiteCabinet = paint((x, y) => (x > 25 && x < 75 && y > 10 && y < 90 ? [215, 215, 212] : white))
    expect(looksLikeDrawing(pixelStats(drawing))).toBe(true)
    expect(looksLikeDrawing(pixelStats(wood))).toBe(false)
    expect(looksLikeDrawing(pixelStats(whiteCabinet))).toBe(false)
    expect(looksLikeDrawing(pixelStats(paint(() => white)))).toBe(false) // empty: no lines
    // Blue dimension lines and figures, as some shops draw them, are still a drawing.
    const blueLines = paint((x, y) => (y === 5 && x > 10 && x < 90 ? [30, 80, 200] : (x === 20 || x === 80) && y > 10 && y < 90 ? [40, 40, 40] : white))
    expect(looksLikeDrawing(pixelStats(blueLines))).toBe(true)
  })

  it('agrees with what real shop pictures are (measured 2026-11, pictures not stored)', async () => {
    const { looksLikeDrawing } = await import('../src/domain/pictures')
    const drawing = [
      { white: 0.933, colorful: 0.022, ink: 0.042, shading: 0.003 }, // cabinet, front and side view, blue dimensions
      { white: 0.912, colorful: 0.028, ink: 0.043, shading: 0.017 },
    ]
    const photos = [
      { white: 0.902, colorful: 0.026, ink: 0.003, shading: 0.069 }, // white shelf from the side, on white
      { white: 0.874, colorful: 0.063, ink: 0.007, shading: 0.057 }, // white shelf with wood, on white
      { white: 0.816, colorful: 0.049, ink: 0.042, shading: 0.093 },
      { white: 0.857, colorful: 0.061, ink: 0.008, shading: 0.075 },
      { white: 0.062, colorful: 0.13, ink: 0.156, shading: 0.652 }, // room scene
    ]
    expect(drawing.map(looksLikeDrawing)).toEqual([true, true])
    expect(photos.map(looksLikeDrawing)).toEqual(photos.map(() => false))
  })

  it('lists the other pictures once and finds a drawing named as such', async () => {
    const { furtherCandidates } = await import('../src/domain/pictures')
    const r = furtherCandidates(
      ['https://a.example/1.jpg?w=400', 'https://a.example/2.jpg', 'https://a.example/2.jpg?w=90', 'https://a.example/dimensions.png'],
      'https://a.example/1.jpg',
    )
    expect(r).toEqual({ named: 'https://a.example/dimensions.png', others: ['https://a.example/2.jpg', 'https://a.example/dimensions.png'] })
  })
})
