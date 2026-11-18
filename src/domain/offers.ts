/**
 * Offers from several shops for one product. The cheapest total (price plus shipping) is the
 * product's price, so requirements on the price, sorting and "cheapest" keep working unchanged.
 */
import type { Offer, Product } from '../db/types'

export const offerTotal = (o: Pick<Offer, 'price' | 'shipping'>): number | null =>
  o.price === null ? null : Math.round((o.price + (o.shipping ?? 0)) * 100) / 100

/** The offer with the lowest total; on a tie the more recent one. Null when no offer has a price. */
export function bestOffer(offers: Offer[] | undefined): Offer | null {
  let best: Offer | null = null
  for (const o of offers ?? []) {
    const t = offerTotal(o)
    if (t === null) continue
    const b = best && offerTotal(best)!
    if (best === null || t < b! || (t === b && o.date > best.date)) best = o
  }
  return best
}

/**
 * The product fields that follow from its offers: price, the date of that price and the shop.
 * Empty when no offer has a price – then the product keeps the price it had.
 */
export function priceFromOffers(offers: Offer[]): Partial<Pick<Product, 'price' | 'priceDate' | 'retailer'>> {
  const best = bestOffer(offers)
  if (!best) return {}
  return { price: offerTotal(best), priceDate: best.date, retailer: best.shop }
}
