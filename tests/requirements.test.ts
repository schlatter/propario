import { describe, expect, it } from 'vitest'
import { makeProduct, makeProperty, makeRequirement } from '../src/db/factories'
import { evaluate, summarize } from '../src/domain/requirements'

const depth = makeProperty('p', { name: 'Tiefe', type: 'number', unit: 'cm' })
const solid = makeProperty('p', { name: 'Massivholz', type: 'boolean' })
const props = new Map([depth, solid].map((x) => [x.id, x]))

const maxDepth = makeRequirement('p', {
  label: 'Max. Tiefe',
  priority: 'must',
  condition: { target: { kind: 'property', propertyId: depth.id }, op: 'lte', value: 40 },
})
const budget = makeRequirement('p', { label: 'Budget', priority: 'important', condition: { target: { kind: 'price' }, op: 'lte', value: 500 } })
const noSolid = makeRequirement('p', {
  label: 'Kein Massivholz',
  priority: 'exclusion',
  condition: { target: { kind: 'property', propertyId: solid.id }, op: 'isTrue' },
})
const manual = makeRequirement('p', { label: 'Schön', priority: 'wish' })

describe('evaluate', () => {
  it('passes and fails numeric limits', () => {
    expect(evaluate(maxDepth, makeProduct('p', { values: { [depth.id]: 38 } }), props)).toBe('pass')
    expect(evaluate(maxDepth, makeProduct('p', { values: { [depth.id]: 45 } }), props)).toBe('fail')
  })

  it('treats missing data as unknown, never as failure', () => {
    expect(evaluate(maxDepth, makeProduct('p'), props)).toBe('unknown')
    expect(evaluate(budget, makeProduct('p'), props)).toBe('unknown')
    // A value kept as raw text is unknown as well.
    expect(evaluate(maxDepth, makeProduct('p', { values: { [depth.id]: 'ca. 40?' } }), props)).toBe('unknown')
  })

  it('inverts exclusion criteria', () => {
    expect(evaluate(noSolid, makeProduct('p', { values: { [solid.id]: true } }), props)).toBe('fail')
    expect(evaluate(noSolid, makeProduct('p', { values: { [solid.id]: false } }), props)).toBe('pass')
  })

  it('uses manual results for requirements without a rule', () => {
    expect(evaluate(manual, makeProduct('p'), props)).toBe('unknown')
    expect(evaluate(manual, makeProduct('p', { checks: { [manual.id]: 'pass' } }), props)).toBe('pass')
  })
})

describe('summarize', () => {
  const reqs = [maxDepth, budget, noSolid, manual]
  it('blocks on a failed must criterion', () => {
    const s = summarize(reqs, makeProduct('p', { price: 300, values: { [depth.id]: 45, [solid.id]: false } }), props)
    expect(s).toMatchObject({ blocked: true, qualified: false, pass: 2, fail: 1, unknown: 1 })
  })
  it('qualifies when all blocking criteria are known to pass', () => {
    const s = summarize(reqs, makeProduct('p', { price: 900, values: { [depth.id]: 35, [solid.id]: false } }), props)
    expect(s).toMatchObject({ blocked: false, qualified: true, fail: 1 })
  })
  it('stays open when a must criterion is unknown', () => {
    const s = summarize(reqs, makeProduct('p', { values: { [solid.id]: false } }), props)
    expect(s).toMatchObject({ blocked: false, qualified: false })
  })
})

describe('requirements shown in the columns they concern', () => {
  it('maps rules to columns and gives each cell one verdict', async () => {
    const { cellCheck, requirementsByColumn } = await import('../src/domain/requirements')
    const byCol = requirementsByColumn([maxDepth, budget, noSolid, manual])
    expect([...byCol.keys()]).toEqual([`prop:${depth.id}`, 'price', `prop:${solid.id}`])
    const unfinished = makeRequirement('p', { priority: 'must', condition: { target: { kind: 'price' }, op: 'lte', value: '' } })
    expect(requirementsByColumn([unfinished]).size).toBe(0)
    const reqs = byCol.get(`prop:${depth.id}`)!
    expect(cellCheck(reqs, makeProduct('p', { values: { [depth.id]: 38 } }), props)).toBe('pass')
    expect(cellCheck(reqs, makeProduct('p', { values: { [depth.id]: 45 } }), props)).toBe('fail')
    expect(cellCheck(reqs, makeProduct('p'), props)).toBe('unknown')
    // Exclusion: having solid wood fails, not having it passes.
    expect(cellCheck(byCol.get(`prop:${solid.id}`)!, makeProduct('p', { values: { [solid.id]: true } }), props)).toBe('fail')
  })

  it('counts must and other requirements apart', async () => {
    const { splitByWeight } = await import('../src/domain/requirements')
    const items = [
      { result: 'pass', blocking: true },
      { result: 'pass', blocking: true },
      { result: 'fail', blocking: false },
      { result: 'unknown', blocking: false },
    ] as const
    expect(splitByWeight([...items])).toEqual({ must: { pass: 2, fail: 0, total: 2 }, other: { pass: 0, fail: 1, total: 2 } })
  })
})

describe('new entries', () => {
  it('count as new for three days', async () => {
    const { isNew } = await import('../src/domain/display')
    const now = new Date('2026-11-18T12:00:00Z')
    expect(isNew('2026-11-15T12:00:01Z', now)).toBe(true)
    expect(isNew('2026-11-15T11:59:59Z', now)).toBe(false)
    expect(isNew('', now)).toBe(false)
    expect(isNew('2027-01-01T00:00:00Z', now)).toBe(false) // a clock far ahead does not keep it new forever
  })
})
