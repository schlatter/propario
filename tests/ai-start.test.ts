import { describe, expect, it } from 'vitest'
import { makeProduct, makeProject, makeProperty, makeRequirement } from '../src/db/factories'
import { splitAnswer, startForAi } from '../src/domain/ai-export'
import { planRule } from '../src/domain/start'
import type { Formatters } from '../src/i18n'
import { de } from '../src/i18n/de'
import { en } from '../src/i18n/en'
import { planMerge, planRequirements } from '../src/import/merge'
import { textToGrids } from '../src/import/table-text'

const fmt = { money: (n) => `€${n}`, date: (s) => s, number: (n) => String(n), dateTime: (s) => s, relative: (s) => s, bytes: (n) => `${n}` } as Formatters

describe('the start request for one’s own AI', () => {
  it('carries what was written and asks for the two tables', () => {
    const project = makeProject({ name: 'Travel tripod', description: 'Light, always in the day bag. Ours: https://shop.example/big', budget: 80 })
    const text = startForAi({ project, products: [makeProduct(project.id, { url: 'https://shop.example/mini' })], rules: [], propMap: new Map() }, en, fmt)
    expect(text).toContain('# Travel tripod')
    expect(text).toContain(en.ai.startPrompt)
    expect(text).toContain('Light, always in the day bag. Ours: https://shop.example/big')
    expect(text).toContain('Budget: ≤ €80')
    expect(text).toContain('https://shop.example/mini')
    expect(text).toContain('| Priority | Requirement | Rule | Description |')
    expect(text).toContain(`| ${en.field.url} | Brand | Model | Price | … |`)
  })
})

/** An answer in the asked format, as an AI writes it: prose, two tables, questions. */
const answerEn = `Here is a start.

| Priority | Requirement | Rule | Description |
| --- | --- | --- | --- |
| Must | Carries at least 2 kg | Load capacity (kg) >= 2 | camera and lens weigh 1.4 kg |
| Must | Price | Price <= 80 | |
| Important | Short when packed | Packed length (cm) <= 35 | |
| Wish | Holds a phone too | | |

| Link | Brand | Model | Price | Load capacity (kg) | Packed length (cm) |
| --- | --- | --- | --- | --- | --- |
| https://shop.example/grip-3 | Gripa | Flex 3 | 63 | 3 | 30.5 |
| https://shop.example/octo-2 | Octo | Two | 26 | 2 | 31 |

Which lens do you use most?`

describe('an answer to the start request, read back', () => {
  it('gives the requirements with their rules', () => {
    const reqs = planRequirements(textToGrids(answerEn), [])
    expect(reqs.map((r) => [r.priority, r.label])).toEqual([
      ['must', 'Carries at least 2 kg'],
      ['must', 'Price'],
      ['important', 'Short when packed'],
      ['wish', 'Holds a phone too'],
    ])
    expect(reqs[0].condition).toEqual({ propertyName: 'Load capacity (kg)', op: 'gte', value: 2 })
    expect(reqs[0].description).toBe('camera and lens weigh 1.4 kg')
    expect(reqs[1].condition).toEqual({ propertyName: null, op: 'lte', value: 80 })
    expect(reqs[3].condition).toBeNull()
  })

  it('is counted as products and requirements, its prose kept', () => {
    const parts = splitAnswer(answerEn)
    expect([parts.rows, parts.requirements]).toEqual([2, 4])
    expect(parts.prose).toBe('Here is a start.\n\nWhich lens do you use most?')
  })

  it('leaves out requirements the comparison already has', () => {
    expect(planRequirements(textToGrids(answerEn), [makeRequirement('c', { label: 'carries at least 2 KG' })]).map((r) => r.label)).not.toContain(
      'Carries at least 2 kg',
    )
  })

  it('gives the products with new fields for the values the rules check', () => {
    const plan = planMerge(textToGrids(answerEn), [], [])!
    expect(plan.items.map((i) => [i.kind, i.incoming.brand, i.incoming.price, i.incoming.url])).toEqual([
      ['new', 'Gripa', 63, 'https://shop.example/grip-3'],
      ['new', 'Octo', 26, 'https://shop.example/octo-2'],
    ])
    expect(plan.newFields.map((f) => [f.name, f.type, f.unit])).toEqual([
      ['Load capacity', 'number', 'kg'],
      ['Packed length', 'number', 'cm'],
    ])
  })

  it('reads the German answer the same way', () => {
    const answerDe = `| Priorität | Anforderung | Regel | Beschreibung |
| --- | --- | --- | --- |
| Muss | Trägt mindestens 2 kg | Traglast (kg) >= 2 | |
| Ausschluss | Kugelkopf aus Plastik | | |

| Produktlink | Hersteller / Marke | Modell / Produktname | Preis | Traglast (kg) |
| --- | --- | --- | --- | --- |
| https://shop.example/grip-3 | Gripa | Flex 3 | 63 | 3 |`
    expect(planRequirements(textToGrids(answerDe), []).map((r) => [r.priority, r.condition?.propertyName ?? null])).toEqual([
      ['must', 'Traglast (kg)'],
      ['exclusion', null],
    ])
    expect(planMerge(textToGrids(answerDe), [], [])!.newFields.map((f) => f.name)).toEqual(['Traglast'])
    expect(startForAi({ project: makeProject({ name: 'Stativ' }), products: [], rules: [], propMap: new Map() }, de, fmt)).toContain(
      '| Priorität | Anforderung | Regel | Beschreibung |',
    )
  })
})

describe('an answer as a chat AI really writes it', () => {
  // Shape of a real answer (invented products): links as [Shop](url?utm_source=…), prices with a
  // decimal comma, and a rule with "=" that mixes up rows.
  const answer = `## Anforderungen

| Priorität | Anforderung | Regel | Beschreibung |
| --- | --- | --- | --- |
| Muss | Ausreichende Tragfähigkeit | Traglast (kg) >= 2 | für Kamera und Objektiv |
| Muss | Kompaktes Transportmaß | Packmaß (cm) = 3 | Reserve für größere Objektive |

## Produktvorschläge

| Produktlink | Hersteller / Marke | Modell / Produktname | Preis | Traglast (kg) | Packmaß (cm) |
| --- | --- | --- | --- | --- | --- |
| [Shop A](https://www.shop-a.example/gripa-flex-3.html?utm_source=chatgpt.com) | Gripa | Flex 3 | 79,00 | 3 | 30,5 |
| [Shop B](https://shop-b.example/p/octo-two?utm_source=chatgpt.com) | Octo | Two | 29,69 | 2 | 31 |
`

  it('keeps a requirement with an exact number, but checks it by hand', () => {
    const reqs = planRequirements(textToGrids(answer), [])
    expect(reqs.map((r) => [r.label, r.condition])).toEqual([
      ['Ausreichende Tragfähigkeit', { propertyName: 'Traglast (kg)', op: 'gte', value: 2 }],
      ['Kompaktes Transportmaß', null],
    ])
  })

  it('takes links without tracking, the shop as retailer and decimal commas as numbers', () => {
    const items = planMerge(textToGrids(answer), [], [])!.items
    expect(items.map((i) => [i.incoming.url, i.incoming.retailer, i.incoming.price])).toEqual([
      ['https://www.shop-a.example/gripa-flex-3.html', 'shop-a.example', 79],
      ['https://shop-b.example/p/octo-two', 'shop-b.example', 29.69],
    ])
  })

  it('asks for up to 10 products, limits as <= or >=, and a check of each must rule', () => {
    const text = startForAi({ project: makeProject({ name: 'Stativ', description: 'leicht' }), products: [], rules: [], propMap: new Map() }, de, fmt)
    expect(text).toContain('bis zu 10 Produkte')
    expect(text).toContain('nie =')
    expect(text).toContain('Eine Muss-Regel, die keiner erfüllt, ist zu streng')
  })
})

describe('the check a requirement gets', () => {
  const load = makeProperty('c', { name: 'Load capacity', type: 'number', unit: 'kg' })

  it('uses the field the rule names, with or without its unit', () => {
    expect(planRule('Carries 2 kg', { propertyName: 'Load capacity (kg)', op: 'gte', value: 2 }, [load])).toEqual({
      target: { kind: 'field', id: load.id },
      op: 'gte',
      value: 2,
    })
  })

  it('asks for a new number field when the comparison has none, and checks the price as the price', () => {
    expect(planRule('Short', { propertyName: 'Packed length (cm)', op: 'lte', value: 35 }, [load])?.target).toEqual({
      kind: 'newField',
      name: 'Packed length',
      unit: 'cm',
    })
    expect(planRule('Price', { propertyName: null, op: 'lte', value: 80 }, [])?.target).toEqual({ kind: 'price' })
    expect(planRule('Preis max. 100', null, [])).toEqual({ target: { kind: 'price' }, op: 'lte', value: 100 })
  })

  it('reads the words when there is no rule, and stays manual without a number', () => {
    expect(planRule('Breite max. 60 cm', null, [])?.target).toEqual({ kind: 'newField', name: 'Breite', unit: 'cm' })
    expect(planRule('Holds a phone too', null, [])).toBeNull()
  })
})
