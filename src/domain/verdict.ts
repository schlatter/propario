/**
 * How a product stands, in one place:
 * - its status for everyone: open (not looked at yet), checked, or excluded;
 * - a favourite star, also for everyone;
 * - each person's verdict: thumbs up, neutral, thumbs down (`votes`, keyed by account).
 * Records from before 0.12 kept a favourite as status 'favorite': that reads as checked + star.
 */
import type { Product, Status, Vote } from '../db/types'

export const statusOf = (p: Pick<Product, 'candidate'>): Status => (p.candidate === 'favorite' ? 'checked' : p.candidate)

export const isFavorite = (p: Pick<Product, 'candidate' | 'favorite'>) => p.favorite === true || p.candidate === 'favorite'

/** The change that sets a status, keeping an old-style favourite's star. */
export function statusPatch(p: Pick<Product, 'candidate' | 'favorite'>, status: Status): Partial<Product> {
  return p.candidate === 'favorite' ? { candidate: status, favorite: true } : { candidate: status }
}

/** The change that sets or clears the star, turning an old-style favourite into checked + star. */
export function favoritePatch(p: Pick<Product, 'candidate' | 'favorite'>, on: boolean): Partial<Product> {
  return p.candidate === 'favorite' ? { candidate: 'checked', favorite: on } : { favorite: on }
}

/** How many people gave each verdict. */
export function tally(p: Pick<Product, 'votes'>): Record<Vote, number> {
  const t = { like: 0, neutral: 0, dislike: 0 }
  for (const v of Object.values(p.votes ?? {})) if (v in t) t[v]++
  return t
}
