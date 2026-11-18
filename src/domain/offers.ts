/**
 * Offers from several shops for one product. The cheapest total (price plus shipping) is the
 * product's price, so requirements on the price, sorting and "cheapest" keep working unchanged.
 */
import type { Offer, Product, Project } from '../db/types'

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

/**
 * What the price column says next to a price: against the chosen reference product, else
 * against the budget, else against the cheapest product still in the running.
 */
export type PriceHint =
  | { kind: 'reference' }
  | { kind: 'vsReference'; diff: number }
  | { kind: 'underBudget' | 'overBudget' | 'belowMin'; diff: number }
  | { kind: 'atBudget' }
  | { kind: 'cheapest' }
  | { kind: 'vsCheapest'; diff: number }
  | null

export function priceHint(p: Product, products: Product[], project: Pick<Project, 'budget' | 'budgetMin' | 'priceReference'>): PriceHint {
  if (p.price === null) return null
  const ref = project.priceReference ? products.find((x) => x.id === project.priceReference && x.price !== null) : undefined
  if (ref) return ref.id === p.id ? { kind: 'reference' } : { kind: 'vsReference', diff: round(p.price - ref.price!) }
  // Below a minimum budget says more than how far below the maximum it is.
  if (project.budgetMin !== null && project.budgetMin !== undefined && p.price < project.budgetMin)
    return { kind: 'belowMin', diff: round(project.budgetMin - p.price) }
  if (project.budget !== null && project.budget !== undefined) {
    const diff = round(p.price - project.budget)
    return diff === 0 ? { kind: 'atBudget' } : diff < 0 ? { kind: 'underBudget', diff: -diff } : { kind: 'overBudget', diff }
  }
  const active = products.filter((x) => x.candidate !== 'excluded' && x.price !== null).map((x) => x.price!)
  if (active.length < 2 || p.candidate === 'excluded') return null
  const min = Math.min(...active)
  return p.price === min ? { kind: 'cheapest' } : { kind: 'vsCheapest', diff: round(p.price - min) }
}

const round = (n: number) => Math.round(n * 100) / 100
