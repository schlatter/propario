/**
 * Dates after a purchase. Setting the purchase date suggests the usual deadlines when they are
 * still empty: 14 days to return (the statutory right of withdrawal for online purchases in the
 * EU, counted from receipt) and 2 years of statutory warranty. Both stay editable.
 */
import type { Product, Purchase } from '../db/types'
import { daysSince, shiftDate } from './values'

export function withPurchaseDate(purchase: Purchase, date: string): Purchase {
  return {
    ...purchase,
    date,
    returnUntil: purchase.returnUntil || shiftDate(date, { days: 14 }),
    warrantyUntil: purchase.warrantyUntil || shiftDate(date, { years: 2 }),
  }
}

/** Bought products whose return deadline is today or later, soonest first. */
export function openReturns(products: Product[], now = new Date()): { product: Product; until: string }[] {
  return products
    .filter((p) => p.purchase.status !== 'none' && p.purchase.returnUntil && (daysSince(p.purchase.returnUntil, now) ?? 1) <= 0)
    .map((p) => ({ product: p, until: p.purchase.returnUntil! }))
    .sort((a, b) => a.until.localeCompare(b.until))
}
