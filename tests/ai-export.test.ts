import { describe, expect, it } from 'vitest'
import { makeProduct, makeProject, makeProperty, makeRequirement } from '../src/db/factories'
import { answerLinks, comparisonForAi, splitAnswer } from '../src/domain/ai-export'
import { summarize, withBudget } from '../src/domain/requirements'
import type { Formatters } from '../src/i18n'
import { en } from '../src/i18n/en'

const fmt = { money: (n) => `€${n}`, date: (s) => s, number: (n) => String(n), dateTime: (s) => s, relative: (s) => s, bytes: (n) => `${n}` } as Formatters

describe('copy for my AI', () => {
  it('gives requirements, budget and products, with verdicts – and no names of people', () => {
    const project = makeProject({ name: 'Küchenschrank', budget: 500 })
    const depth = makeProperty(project.id, { name: 'Tiefe', type: 'number', unit: 'cm' })
    const reqs = [
      makeRequirement(project.id, {
        label: 'Max. Tiefe',
        priority: 'must',
        condition: { target: { kind: 'property', propertyId: depth.id }, op: 'lte', value: 40 },
      }),
    ]
    const rules = withBudget(project, reqs, { max: 'Budget ≤ €500', min: 'Budget ≥ €0' })
    const a = makeProduct(project.id, {
      brand: 'Nordhaus',
      model: 'Arvika',
      price: 499,
      values: { [depth.id]: 45 },
      ratings: [{ person: 'Ada', stars: 4, note: 'schön' }],
    })
    const b = makeProduct(project.id, { model: 'Bo', candidate: 'excluded', exclusionCategory: 'size', exclusionReason: 'zu tief' })
    const propMap = new Map([[depth.id, depth]])
    const text = comparisonForAi(
      { project, products: [a, b], properties: [depth], rules, propMap, summaries: new Map([a, b].map((p) => [p.id, summarize(rules, p, propMap)])) },
      en,
      fmt,
    )
    expect(text).toContain('# Küchenschrank')
    expect(text).toContain(en.ai.prompt)
    expect(text).toContain('- [Must] Budget ≤ €500 – Price ≤ 500')
    expect(text).toContain('- [Must] Max. Tiefe – Tiefe ≤ 40')
    expect(text).toContain('### Nordhaus Arvika – Open')
    expect(text).toContain('- Not met: Max. Tiefe')
    expect(text).toContain('- Ratings: 4/5')
    expect(text).toContain('### Bo – Excluded: Size · zu tief')
    expect(text).not.toContain('Ada')
  })

  it('asks what the person asks instead – or, when that is empty, the default', () => {
    const project = makeProject({ name: 'Sofa' })
    const d = { project, products: [], properties: [], rules: [], propMap: new Map(), summaries: new Map() }
    const own = comparisonForAi(d, en, fmt, en.ai.suggestPrompt)
    expect(own).toContain(en.ai.suggestPrompt)
    expect(own).not.toContain(en.ai.prompt)
    expect(own).toContain(en.ai.tableHint)
    expect(comparisonForAi(d, en, fmt, '  ')).toContain(en.ai.prompt)
  })
})

describe('an answer from one’s own AI', () => {
  it('shows the prose without emphasis marks or the table, and counts the table’s products', () => {
    const answer = 'Take **Arvika**.\n\nTwo more:\n\n| Link | Model |\n| --- | --- |\n| https://a.example | Dora |\n| https://b.example | Edda |\n\nGood luck!'
    expect(splitAnswer(answer)).toEqual({ prose: 'Take Arvika.\n\nTwo more:\n\nGood luck!', rows: 2, requirements: 0 })
    expect(splitAnswer('Arvika fits best.')).toEqual({ prose: 'Arvika fits best.', rows: 0, requirements: 0 })
  })
})

describe('product links in an answer', () => {
  it('takes each new link once, from prose and Markdown links, without trailing punctuation', () => {
    const text =
      'Try [Dora](https://shop.example/dora?utm_source=chatgpt.com) or https://shop.example/edda. ' +
      'Also https://shop.example/dora again, and https://www.known.example/arvika/ (you have it).'
    expect(answerLinks(text, [{ url: 'https://known.example/arvika' }, { url: '' }])).toEqual(['https://shop.example/dora', 'https://shop.example/edda'])
    expect(answerLinks('No links here.', [])).toEqual([])
  })
})
