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

describe('a link shared from another app', () => {
  it('is found in url, else in the text or title, without trailing punctuation', async () => {
    const { sharedLink } = await import('../src/domain/links')
    expect(sharedLink({ url: 'https://shop.example/p/1' })).toBe('https://shop.example/p/1')
    expect(sharedLink({ text: 'Schau mal: https://shop.example/p/1?x=2.', title: 'Regal' })).toBe('https://shop.example/p/1?x=2')
    expect(sharedLink({ title: 'Regal (https://shop.example/p/1)' })).toBe('https://shop.example/p/1')
    expect(sharedLink({ text: 'javascript:alert(1) und nichts sonst' })).toBeNull()
  })
})

describe('a field asked for by a requirement', () => {
  it('takes name, unit, direction and limit from its words', async () => {
    const { fieldFromRequirement } = await import('../src/import/normalize')
    expect(fieldFromRequirement('Maximale Tiefe 40 cm')).toEqual({ name: 'Tiefe', unit: 'cm', op: 'lte', value: 40 })
    expect(fieldFromRequirement('Mindestens 4 Einlegeböden')).toEqual({ name: 'Einlegeböden', unit: '', op: 'gte', value: 4 })
    expect(fieldFromRequirement('Gewicht', 'höchstens 30,5 kg')).toEqual({ name: 'Gewicht', unit: 'kg', op: 'lte', value: 30.5 })
    expect(fieldFromRequirement('Offene Mitte')).toEqual({ name: 'Offene Mitte', unit: '' })
  })
})
