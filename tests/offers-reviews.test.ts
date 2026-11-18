import { describe, expect, it } from 'vitest'
import { makeProduct } from '../src/db/factories'
import type { Offer, Review } from '../src/db/types'
import { bestOffer, priceFromOffers } from '../src/domain/offers'
import { reviewSummary, score } from '../src/domain/reviews'
import { shiftDate } from '../src/domain/values'
import { newId } from '../src/shared/ids'
import { checkChange, checkFields } from '../src/shared/records'

const offer = (o: Partial<Offer>): Offer => ({ id: newId(), shop: '', price: null, shipping: null, date: '', url: '', ...o })
const review = (r: Partial<Review>): Review => ({
  id: newId(),
  source: '',
  about: 'product',
  value: null,
  scale: 'stars5',
  count: null,
  date: '',
  url: '',
  ...r,
})

describe('offers', () => {
  it('takes the cheapest total including shipping, the newer one on a tie', () => {
    const a = offer({ shop: 'A', price: 100, shipping: 10, date: '2026-11-01' })
    const b = offer({ shop: 'B', price: 105, shipping: 0, date: '2026-11-02' })
    const c = offer({ shop: 'C', price: 104.5, shipping: 0.5, date: '2026-11-03' })
    expect(bestOffer([a, b, c])?.shop).toBe('C')
    expect(priceFromOffers([a, b, c])).toEqual({ price: 105, priceDate: '2026-11-03', retailer: 'C' })
  })

  it('leaves the price alone when no offer has one', () => {
    expect(priceFromOffers([offer({ shop: 'A' })])).toEqual({})
    expect(bestOffer(undefined)).toBeNull()
  })
})

describe('reviews from outside sources', () => {
  it('converts every scale to 0–100, higher is better', () => {
    expect(score({ value: 4.3, scale: 'stars5' })).toBe(86)
    expect(score({ value: 1.0, scale: 'grade' })).toBe(90)
    expect(score({ value: 2.5, scale: 'grade' })).toBe(60)
    expect(score({ value: 72, scale: 'percent' })).toBe(72)
    expect(score({ value: 7, scale: 'stars5' })).toBeNull()
    expect(score({ value: null, scale: 'grade' })).toBeNull()
  })

  it('averages product ratings apart from shop ratings', () => {
    const list = [
      review({ source: 'Stiftung Warentest', scale: 'grade', value: 2.0 }), // 70
      review({ source: 'Amazon', scale: 'stars5', value: 4.5 }), // 90
      review({ source: 'Trustpilot', about: 'shop', scale: 'stars5', value: 2.0 }), // 40
      review({ source: 'idealo' }), // no value: not counted
    ]
    expect(reviewSummary(list, 'product')).toEqual({ score: 80, sources: 2 })
    expect(reviewSummary(list, 'shop')).toEqual({ score: 40, sources: 1 })
    expect(reviewSummary(undefined, 'product')).toEqual({ score: null, sources: 0 })
  })
})

describe('return and warranty dates', () => {
  it('moves dates by days and years, clamping the end of the month', () => {
    expect(shiftDate('2026-11-20', { days: 14 })).toBe('2026-12-04')
    expect(shiftDate('2024-02-29', { years: 2 })).toBe('2026-02-28')
    expect(shiftDate('', { days: 14 })).toBe('')
  })
})

describe('server validation of offers, reviews and purchase dates', () => {
  it('accepts well-formed entries', () => {
    const fields = {
      offers: [offer({ shop: 'A', price: 99.9, shipping: 4.95, date: '2026-11-18', url: 'https://a.example/p' })],
      reviews: [review({ source: 'Amazon', value: 4.4, count: 1234, url: 'https://www.amazon.de/dp/X' })],
      purchase: { ...makeProduct('p').purchase, returnUntil: '2026-12-02', warrantyUntil: '' },
    }
    expect(checkFields('products', fields)).toBeNull()
  })

  it('refuses what a hostile or broken client could send', () => {
    const bad: [string, unknown][] = [
      ['url', { offers: [offer({ url: 'javascript:alert(1)' })] }],
      ['negative', { offers: [offer({ price: -1 })] }],
      ['unexpected', { offers: [{ ...offer({}), script: '<x>' }] }],
      ['UUID', { offers: [offer({ id: '1' })] }],
      ['a number or null', { reviews: [review({ value: '4,5' as never })] }],
      ['scale is unknown', { reviews: [review({ scale: 'hearts' as never })] }],
      ['scale is unknown', { reviews: [review({ scale: 'constructor' as never })] }],
      ['product or shop', { reviews: [review({ about: 'seller' as never })] }],
      ['whole number', { reviews: [review({ count: 1.5 })] }],
      ['at most', { offers: Array.from({ length: 51 }, () => offer({})) }],
      ['exclusionCategory', { exclusionCategory: 'boring' }],

      ['returnUntil', { purchase: { ...makeProduct('p').purchase, returnUntil: 'soon' } }],
    ]
    for (const [msg, fields] of bad) expect(checkFields('products', fields as Record<string, unknown>), msg).toMatch(new RegExp(msg))
  })

  it('checks the comparison budget and the direction of a field', () => {
    expect(checkFields('projects', { budget: 1000, priceReference: '' })).toBeNull()
    expect(checkFields('projects', { budget: null })).toBeNull()
    expect(checkFields('projects', { budget: -5 })).toMatch(/budget/)
    expect(checkFields('projects', { priceReference: '<script>' })).toMatch(/priceReference/)
    expect(checkFields('properties', { better: 'lower' })).toBeNull()
    expect(checkFields('properties', { better: 'sideways' })).toMatch(/better/)
  })

  it('still accepts records and patches from before these fields existed', () => {
    const old = makeProduct('00000000-0000-4000-8000-000000000001') as unknown as Record<string, unknown>
    delete old.offers
    delete old.reviews
    old.purchase = { status: 'none', date: '', price: null, retailer: '', note: '' }
    expect(checkChange({ op: 'create', kind: 'products', record: old })).toBeNull()
    expect(checkChange({ op: 'patch', kind: 'products', id: old.id, projectId: old.projectId, patch: { purchase: old.purchase, price: 3 } })).toBeNull()
  })
})

describe('purchase dates', () => {
  it('suggests return and warranty deadlines once, without overwriting', async () => {
    const { withPurchaseDate, openReturns } = await import('../src/domain/purchase')
    const base = makeProduct('p').purchase
    const p1 = withPurchaseDate(base, '2026-11-20')
    expect(p1).toMatchObject({ date: '2026-11-20', returnUntil: '2026-12-04', warrantyUntil: '2028-11-20' })
    expect(withPurchaseDate({ ...p1, returnUntil: '2026-12-31' }, '2026-11-21').returnUntil).toBe('2026-12-31')

    const bought = makeProduct('p', { purchase: { ...p1, status: 'purchased' } })
    const old = makeProduct('p', { purchase: { ...p1, status: 'purchased', returnUntil: '2026-11-01' } })
    const now = new Date(2026, 10, 25)
    expect(openReturns([old, bought], now).map((r) => r.until)).toEqual(['2026-12-04'])
    expect(openReturns([bought], new Date(2026, 11, 4))).toHaveLength(1) // the last day still counts
  })
})
