/**
 * Links to look a product up elsewhere: price comparisons, independent tests, experiences with
 * the shop. Built in the browser from the product's own fields – Propario fetches nothing and
 * adds no affiliate or tracking parameters. The targets are fixed here, never configurable, so
 * no one can turn this list into a way to plant other links.
 */
import type { Product } from '../db/types'
import { isValidGtin } from '../shared/product-facts.ts'
import { hostOf } from './values'

export type LookupId = 'google' | 'geizhals' | 'idealo' | 'amazon' | 'ebay' | 'kleinanzeigen' | 'mydealz' | 'warentest' | 'trustpilot' | 'cashback'

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

const PRICES = (words: string): LookupLink[] => [
  { id: 'geizhals', href: `https://geizhals.de/?fs=${q(words)}` },
  { id: 'idealo', href: `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${q(words)}` },
  // Many customer reviews; a plain search link, no partner tag.
  { id: 'amazon', href: `https://www.amazon.de/s?k=${q(words)}` },
]

/**
 * Where to look for products not in the comparison yet, for any words – in two groups: shops
 * (Google's shopping search across shops first, the price comparisons, Amazon) and used or on
 * offer (eBay, Kleinanzeigen, the deals of mydealz).
 *
 * `maxPrice` goes along where the site's own search address takes it, as checked on the site:
 * Kleinanzeigen (`s-preis::500/…`) and eBay (`_udhi=500`). The others have no such address
 * that is documented or stable, so they search without it rather than with a guess.
 */
export function searchLinks(query: string, maxPrice: number | null = null): { shops: LookupLink[]; more: LookupLink[] } {
  const words = query.trim()
  if (!words) return { shops: [], more: [] }
  const max = maxPrice !== null && Number.isFinite(maxPrice) && maxPrice > 0 ? Math.round(maxPrice) : null
  // Kleinanzeigen writes the words into the path, joined by hyphens.
  const slug = words.split(/\s+/).map(q).join('-')
  return {
    shops: [{ id: 'google', href: `https://www.google.com/search?udm=28&q=${q(words)}` }, ...PRICES(words)],
    more: [
      { id: 'ebay', href: `https://www.ebay.de/sch/i.html?_nkw=${q(words)}${max ? `&_udhi=${max}` : ''}` },
      { id: 'kleinanzeigen', href: `https://www.kleinanzeigen.de/s-${max ? `preis::${max}/` : ''}${slug}/k0` },
      { id: 'mydealz', href: `https://www.mydealz.de/search?q=${q(words)}` },
    ],
  }
}

export function lookupLinks(p: Pick<Product, 'brand' | 'model' | 'gtin' | 'url'>): LookupLink[] {
  const name = [p.brand, p.model]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ')
  const gtin = p.gtin && isValidGtin(p.gtin) ? p.gtin : ''
  // Price comparisons find the exact product by its GTIN; test sites only by name.
  const exact = gtin || name
  const links = exact ? PRICES(exact) : []
  if (name) links.push({ id: 'warentest', href: `https://www.test.de/suche/?q=${q(name)}` })
  const shop = hostOf(p.url ?? '')
  if (shop) {
    links.push({ id: 'trustpilot', href: `https://de.trustpilot.com/review/${q(shop)}` })
    // Whether cashback portals pay for this shop. The overview has no address per shop (its
    // filter runs in the page), so the link opens the overview; nothing goes along.
    links.push({ id: 'cashback', href: 'https://cashback-optimizer.de/' })
  }
  return links
}
