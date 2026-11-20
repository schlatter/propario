/**
 * How a product stands, in one place:
 * - its status for everyone: open (not looked at yet), checked, or excluded;
 * - each person's own favourite star (`favorites`, keyed by account; 0.14). A star from before
 *   stars were personal (`favorite`) counts for everyone who has not chosen yet;
 * - each person's verdict: thumbs up, neutral, thumbs down (`votes`, keyed by account).
 * Records from before 0.12 kept a favourite as status 'favorite': that reads as checked + star.
 */
import type { Product, Status, Vote } from '../db/types'

export const statusOf = (p: Pick<Product, 'candidate'>): Status => (p.candidate === 'favorite' ? 'checked' : p.candidate)

type Starred = Pick<Product, 'candidate' | 'favorite' | 'favorites'>
const oldStar = (p: Starred) => p.favorite === true || p.candidate === 'favorite'

/** Whether `userId` starred the product; without a person: whether anyone did (exports). */
export function isFavorite(p: Starred, userId?: string): boolean {
  if (userId) return p.favorites?.[userId] ?? oldStar(p)
  return Object.values(p.favorites ?? {}).some(Boolean) || oldStar(p)
}

/** The change that sets a status, keeping an old-style favourite's star. */
export function statusPatch(p: Pick<Product, 'candidate' | 'favorite'>, status: Status): Partial<Product> {
  return p.candidate === 'favorite' ? { candidate: status, favorite: true } : { candidate: status }
}

/**
 * The change that sets or clears one person's star. The old shared star stays for the others;
 * an old-style favourite status becomes checked with that shared star.
 */
export function favoritePatch(p: Pick<Product, 'candidate' | 'favorite'>, userId: string, on: boolean): Partial<Product> {
  const own = { favorites: { [userId]: on } }
  return p.candidate === 'favorite' ? { ...own, candidate: 'checked', favorite: true } : own
}

/** How many people gave each verdict. */
export function tally(p: Pick<Product, 'votes'>): Record<Vote, number> {
  const t = { like: 0, neutral: 0, dislike: 0 }
  for (const v of Object.values(p.votes ?? {})) if (v in t) t[v]++
  return t
}
