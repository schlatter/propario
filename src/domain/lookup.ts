/**
 * Links to look a product up elsewhere: price comparisons, independent tests, experiences with
 * the shop. Built in the browser from the product's own fields – Propario fetches nothing and
 * adds no affiliate or tracking parameters. The targets are fixed here, never configurable, so
 * no one can turn this list into a way to plant other links.
 */
import type { Product } from '../db/types'
import { isValidGtin } from '../shared/product-facts.ts'
import { hostOf } from './values'

export type LookupId = 'geizhals' | 'idealo' | 'amazon' | 'warentest' | 'trustpilot'

export interface LookupLink {
  id: LookupId
  href: string
}

const q = encodeURIComponent

/**
 * What to search for first: the product type most of the products share ("Sideboard"), else the
 * comparison's name – a category like "Furniture" is too broad to find more of the same.
 */
export function searchTerm(name: string, products: Pick<Product, 'productType'>[]): string {
  const count = new Map<string, number>()
  for (const p of products) {
    const t = p.productType?.trim()
    if (t) count.set(t, (count.get(t) ?? 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? name.trim()
}

/** Where to look for products not in the comparison yet: the shops' own search for any words. */
export function searchLinks(query: string): LookupLink[] {
  const words = query.trim()
  if (!words) return []
  return [
    { id: 'geizhals', href: `https://geizhals.de/?fs=${q(words)}` },
    { id: 'idealo', href: `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${q(words)}` },
    // Many customer reviews; a plain search link, no partner tag.
    { id: 'amazon', href: `https://www.amazon.de/s?k=${q(words)}` },
  ]
}

export function lookupLinks(p: Pick<Product, 'brand' | 'model' | 'gtin' | 'url'>): LookupLink[] {
  const name = [p.brand, p.model]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
  const gtin = p.gtin && isValidGtin(p.gtin) ? p.gtin : ''
  // Price comparisons find the exact product by its GTIN; test sites only by name.
  const exact = gtin || name
  const links = searchLinks(exact)
  if (name) links.push({ id: 'warentest', href: `https://www.test.de/suche/?q=${q(name)}` })
  const shop = hostOf(p.url ?? '')
  if (shop) links.push({ id: 'trustpilot', href: `https://de.trustpilot.com/review/${q(shop)}` })
  return links
}
