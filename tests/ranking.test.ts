import { describe, expect, it } from 'vitest'
import { makeProduct, makeProject, makeProperty, makeRequirement } from '../src/db/factories'
import { priceHint } from '../src/domain/offers'
import { directionOf, rank } from '../src/domain/ranking'
import { summarize, withBudget } from '../src/domain/requirements'

describe('ranking values side by side', () => {
  it('marks best and worst and measures the distance to the best', () => {
    const r = rank([989, 1200, null, 949], 'lower')
    expect([...r.best]).toEqual([3])
    expect([...r.worst]).toEqual([1])
    expect(r.delta).toEqual([40, 251, null, 0])
    const h = rank([3, 5, 4], 'higher')
    expect([...h.best]).toEqual([1])
    expect(h.delta).toEqual([-2, 0, -1])
  })

  it('without a direction only places values, without judging; one value is no ranking', () => {
    const r = rank([60, 80, 70])
    expect(r.best.size + r.worst.size).toBe(0)
    expect(r.scale).toEqual([0, 1, 0.5])
    expect(rank([60, 60], 'lower').best.size).toBe(0)
    expect(rank([60, null], 'lower').scale).toEqual([null, null])
  })

  it('takes the direction from the field, else from its rules', () => {
    const depth = makeProperty('p', { name: 'Tiefe', type: 'number' })
    const rule = (op: 'lte' | 'gte', priority: 'must' | 'avoid' = 'must') =>
      makeRequirement('p', { priority, condition: { target: { kind: 'property', propertyId: depth.id }, op, value: 40 } })
    expect(directionOf(depth, [rule('lte')])).toBe('lower')
    expect(directionOf(depth, [rule('gte', 'avoid')])).toBe('lower')
    expect(directionOf(depth, [rule('lte'), rule('gte')])).toBeUndefined()
    expect(directionOf({ ...depth, better: 'higher' }, [rule('lte')])).toBe('higher')
  })
})

describe('budget and price reference', () => {
  const project = makeProject({ budget: 1000 })
  const a = makeProduct('p', { price: 949 })
  const b = makeProduct('p', { price: 1200 })
  const c = makeProduct('p', { price: 1000, candidate: 'excluded' })

  it('the budget is a must criterion for every product', () => {
    const rules = withBudget(project, [], 'Budget')
    expect(summarize(rules, a, new Map())).toMatchObject({ blocked: false, qualified: true })
    expect(summarize(rules, b, new Map())).toMatchObject({ blocked: true })
    expect(withBudget(makeProject(), [], 'Budget')).toEqual([])
  })

  it('prices are measured against the reference product, else the budget, else the cheapest', () => {
    expect(priceHint(b, [a, b, c], { ...project, priceReference: a.id })).toEqual({ kind: 'vsReference', diff: 251 })
    expect(priceHint(a, [a, b, c], { ...project, priceReference: a.id })).toEqual({ kind: 'reference' })
    expect(priceHint(a, [a, b, c], project)).toEqual({ kind: 'underBudget', diff: 51 })
    expect(priceHint(b, [a, b, c], project)).toEqual({ kind: 'overBudget', diff: 200 })
    expect(priceHint(c, [a, b, c], project)).toEqual({ kind: 'atBudget' })
    expect(priceHint(b, [a, b, c], { budget: null, priceReference: '' })).toEqual({ kind: 'vsCheapest', diff: 251 })
    // A reference that is gone or has no price falls back.
    expect(priceHint(b, [a, b], { budget: null, priceReference: c.id })).toEqual({ kind: 'vsCheapest', diff: 251 })
  })
})
