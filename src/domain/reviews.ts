/**
 * Ratings from outside sources, entered by hand. Sources rate on different scales; each value is
 * converted to 0–100 so they can be read side by side. Product and shop ratings are never mixed:
 * a good shop does not make a product better.
 */
import type { Review, ReviewScale } from '../db/types'

import { SCALE_RANGE } from '../shared/review-scales.ts'

export { SCALE_RANGE }

/** Well-known sources with how they usually rate; picking one fills in scale and subject. */
export const KNOWN_SOURCES: { name: string; scale: ReviewScale; about: Review['about'] }[] = [
  { name: 'Stiftung Warentest', scale: 'grade', about: 'product' },
  { name: 'ÖKO-TEST', scale: 'grade', about: 'product' },
  { name: 'Amazon', scale: 'stars5', about: 'product' },
  { name: 'idealo', scale: 'stars5', about: 'product' },
  { name: 'Trustpilot', scale: 'stars5', about: 'shop' },
  { name: 'Trusted Shops', scale: 'stars5', about: 'shop' },
]

/** A review's value on 0–100 (higher is better), or null when it has no usable value. */
export function score(r: Pick<Review, 'value' | 'scale'>): number | null {
  if (r.value === null || !Number.isFinite(r.value)) return null
  const [lo, hi] = SCALE_RANGE[r.scale] ?? [NaN, NaN]
  if (!(r.value >= lo && r.value <= hi)) return null
  const s = r.scale === 'stars5' ? (r.value / 5) * 100 : r.scale === 'grade' ? ((5.5 - r.value) / 5) * 100 : r.value
  return Math.round(s)
}

/** Plain mean of the converted values of one subject, and how many sources it rests on. */
export function reviewSummary(reviews: Review[] | undefined, about: Review['about']): { score: number | null; sources: number } {
  const scores = (reviews ?? [])
    .filter((r) => r.about === about)
    .map(score)
    .filter((s): s is number => s !== null)
  return { score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, sources: scores.length }
}
