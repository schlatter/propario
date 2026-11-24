import { describe, expect, it } from 'vitest'
import { makeProduct, makeRequirement } from '../src/db/factories'
import { lookupLinks, searchLinks, searchTerm } from '../src/domain/lookup'
import { daysSince } from '../src/domain/values'
import { summarize } from '../src/domain/requirements'
import { cleanFacts, isValidGtin } from '../src/shared/product-facts'

describe('product facts from a shop page', () => {
  it('accepts GTINs only with a valid check digit', () => {
    expect(isValidGtin('4006381333931')).toBe(true)
    expect(isValidGtin('4006381333932')).toBe(false)
    expect(isValidGtin('96385074')).toBe(true)
    expect(isValidGtin('12345')).toBe(false)
  })

  it('keeps well-formed facts and drops everything else', () => {
    expect(cleanFacts({ gtin: '4 006381 333931', mpn: ' WAX32M40 ', price: '849.00' })).toEqual({ gtin: '4006381333931', mpn: 'WAX32M40', price: 849 })
    expect(cleanFacts({ gtin: '<script>', mpn: 'javascript:alert(1)', price: -3 })).toEqual({})
    expect(cleanFacts({ mpn: 'x'.repeat(65), price: '1,234.00' })).toEqual({})
    expect(cleanFacts('nope')).toEqual({})
  })
})

describe('lookup links', () => {
  it('searches price comparisons by GTIN when known, tests by name, the shop on Trustpilot', () => {
    const p = makeProduct('p', { brand: 'Bosch', model: 'Serie 6 WAX32M40', gtin: '4006381333931', url: 'https://www.shop.example/p/1' })
    const links = Object.fromEntries(lookupLinks(p).map((l) => [l.id, l.href]))
    expect(links.geizhals).toBe('https://geizhals.de/?fs=4006381333931')
    expect(links.idealo).toBe('https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=4006381333931')
    expect(links.amazon).toBe('https://www.amazon.de/s?k=4006381333931')
    expect(links.warentest).toBe('https://www.test.de/suche/?q=Bosch%20Serie%206%20WAX32M40')
    expect(links.trustpilot).toBe('https://de.trustpilot.com/review/shop.example')
  })

  it('falls back to the name, encodes it, and offers nothing without a name', () => {
    const p = makeProduct('p', { brand: 'A&B', model: 'X?1#' })
    expect(lookupLinks(p).find((l) => l.id === 'geizhals')?.href).toBe('https://geizhals.de/?fs=A%26B%20X%3F1%23')
    expect(lookupLinks(makeProduct('p')).map((l) => l.id)).toEqual([])
  })

  it('ignores a GTIN with a wrong check digit and records from before the field existed', () => {
    const p = makeProduct('p', { brand: 'Bosch', model: 'S6', gtin: '4006381333932' })
    expect(lookupLinks(p)[0].href).toContain('Bosch%20S6')
    const old = { ...makeProduct('p', { model: 'S6' }) } as Record<string, unknown>
    delete old.gtin
    expect(lookupLinks(old as never)[0].href).toContain('S6')
  })

  it('searches the shops for any words to find more products, and for nothing when empty', () => {
    expect(searchLinks(' Sideboard & Kommode ').map((l) => [l.id, l.href])).toEqual([
      ['geizhals', 'https://geizhals.de/?fs=Sideboard%20%26%20Kommode'],
      ['idealo', 'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=Sideboard%20%26%20Kommode'],
      ['amazon', 'https://www.amazon.de/s?k=Sideboard%20%26%20Kommode'],
    ])
    expect(searchLinks('  ')).toEqual([])
  })

  it('searches first for the product type most products share, else the comparison’s name', () => {
    const types = ['Sideboard', 'Lowboard', ' Sideboard ', ''].map((productType) => makeProduct('p', { productType }))
    expect(searchTerm('Living room', types)).toBe('Sideboard')
    expect(searchTerm(' Living room ', [makeProduct('p')])).toBe('Living room')
  })
})

describe('weighted fit', () => {
  const reqs = [
    makeRequirement('p', { priority: 'must' }),
    makeRequirement('p', { priority: 'important' }),
    makeRequirement('p', { priority: 'wish' }),
    makeRequirement('p', { priority: 'bonus' }),
  ]
  const [must, important, wish, bonus] = reqs.map((r) => r.id)

  it('weights soft requirements by priority and leaves must criteria out', () => {
    const p = makeProduct('p', { checks: { [must]: 'fail', [important]: 'pass', [wish]: 'fail', [bonus]: 'pass' } })
    const s = summarize(reqs, p, new Map())
    expect(s.fit).toBe(67) // (3 + 1) / (3 + 2 + 1)
    expect(s.blocked).toBe(true)
  })

  it('does not count unknown values as failures, but says how many are open', () => {
    const s = summarize(reqs, makeProduct('p', { checks: { [important]: 'pass' } }), new Map())
    expect(s.fit).toBe(100)
    expect(s.fitOpen).toBe(2)
    expect(summarize(reqs, makeProduct('p'), new Map()).fit).toBeNull()
  })
})

describe('daysSince', () => {
  it('counts whole days and is null for missing dates', () => {
    expect(daysSince('2026-11-10', new Date(2026, 10, 18, 9))).toBe(8)
    expect(daysSince('', new Date())).toBeNull()
  })
})

describe('validation of the new product fields', () => {
  it('refuses malformed GTINs and price dates from any client', async () => {
    const { checkFields } = await import('../src/shared/records')
    expect(checkFields('products', { gtin: '4006381333931', priceDate: '2026-11-18', mpn: 'WAX32M40' })).toBeNull()
    expect(checkFields('products', { gtin: '<img>' })).toMatch(/gtin/)
    expect(checkFields('products', { priceDate: 'yesterday' })).toMatch(/priceDate/)
    expect(checkFields('products', { mpn: 'x'.repeat(65) })).toMatch(/mpn/)
  })
})
