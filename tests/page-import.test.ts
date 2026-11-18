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

  it('keeps other structured lines as extras, but ignores loose table lines', () => {
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
