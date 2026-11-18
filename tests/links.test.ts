import { describe, expect, it } from 'vitest'
import { makeProduct } from '../src/db/factories'
import { sameLink } from '../src/domain/links'
import { planFacts } from '../src/domain/page-import'

describe('the same product link', () => {
  it('ignores www, trailing slashes, fragments, tracking and parameter order', () => {
    const base = 'https://www.shop.example/moebel/regal-arvika-123.html'
    expect(sameLink(base, 'https://shop.example/moebel/regal-arvika-123.html/')).toBe(true)
    expect(sameLink(base, `${base}?utm_source=x&utm_medium=y#details`)).toBe(true)
    expect(sameLink('https://a.example/p?id=1&color=2', 'https://a.example/p?color=2&id=1&gclid=abc')).toBe(true)
  })

  it('keeps apart what can be a different product', () => {
    expect(sameLink('https://a.example/p?id=1', 'https://a.example/p?id=2')).toBe(false)
    expect(sameLink('https://a.example/p/1', 'https://b.example/p/1')).toBe(false)
    expect(sameLink('', '')).toBe(false)
  })
})

describe('updating from the shop page', () => {
  it('refreshes a changed price, but nothing else someone entered', () => {
    const p = makeProduct('p', { model: 'Mein Name', price: 989 })
    const plan = planFacts(p, { name: 'Shop Name', price: 949 }, [], { refreshPrice: true })
    expect(plan.patch).toEqual({ price: 949 })
    expect(planFacts(p, { price: 949 }, []).patch).toEqual({})
    expect(planFacts(p, { price: 989 }, [], { refreshPrice: true }).patch).toEqual({})
  })
})
