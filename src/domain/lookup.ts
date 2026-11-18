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

export function lookupLinks(p: Pick<Product, 'brand' | 'model' | 'gtin' | 'url'>): LookupLink[] {
  const name = [p.brand, p.model]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
  const gtin = p.gtin && isValidGtin(p.gtin) ? p.gtin : ''
  // Price comparisons find the exact product by its GTIN; test sites only by name.
  const exact = gtin || name
  const links: LookupLink[] = []
  if (exact) {
    links.push({ id: 'geizhals', href: `https://geizhals.de/?fs=${q(exact)}` })
    links.push({ id: 'idealo', href: `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${q(exact)}` })
    // Many customer reviews; a plain search link, no partner tag.
    links.push({ id: 'amazon', href: `https://www.amazon.de/s?k=${q(exact)}` })
  }
  if (name) links.push({ id: 'warentest', href: `https://www.test.de/suche/?q=${q(name)}` })
  const shop = hostOf(p.url ?? '')
  if (shop) links.push({ id: 'trustpilot', href: `https://de.trustpilot.com/review/${q(shop)}` })
  return links
}
