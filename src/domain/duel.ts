/**
 * Ranking by duels, one person at a time: the product holding the current place stands on the
 * left, the next challenger on the right; whoever is better takes or keeps the place. When every
 * product after it was compared, the place is decided and the next one is played. The first place
 * is decided after n − 1 duels – a decision comes fast; the rest only if wanted.
 *
 * The state is small and survives products being added, excluded or deleted (`normalize`).
 */
import type { Product, Ranking } from '../db/types'
import { isFavorite } from './verdict'

export type Side = 'left' | 'right'

/** All places decided (the last one needs no duel). */
export const finished = (r: Ranking) => r.settled >= r.order.length - 1

/**
 * The ranking for the products that take part now, in `fallback` order for any not ranked yet.
 * Products that left are dropped; when one did from the place being played, that place starts
 * over – its duels so far may have been against it.
 */
export function normalize(r: Ranking | undefined, fallback: string[]): Ranking {
  const take = new Set(fallback)
  const kept = (r?.order ?? []).filter((id) => take.has(id))
  const order = [...kept, ...fallback.filter((id) => !kept.includes(id))]
  if (!r) return { order, settled: 0, next: Math.min(1, order.length) }
  const settledIds = r.order.slice(0, r.settled).filter((id) => take.has(id))
  const settled = Math.min(settledIds.length, order.length)
  const sameRun = r.order.slice(0, r.next).every((id) => take.has(id)) && settled === r.settled
  const next = sameRun ? Math.max(settled + 1, Math.min(r.next, order.length)) : settled + 1
  return finish({ order, settled, next })
}

/** The two products of the duel to play now, or null when the ranking is complete. */
export function current(r: Ranking): { left: string; right: string } | null {
  return finished(r) || r.next >= r.order.length ? null : { left: r.order[r.settled], right: r.order[r.next] }
}

/** The ranking after choosing the better side of the current duel. */
export function decide(r: Ranking, winner: Side): Ranking {
  if (!current(r)) return r
  const order = [...r.order]
  // The challenger wins: it takes the place, the former holder comes right behind it. The
  // products between move down by one, so the next challenger is still the one after it.
  if (winner === 'right') order.splice(r.settled, 0, ...order.splice(r.next, 1))
  return finish({ order, settled: r.settled, next: r.next + 1 })
}

/**
 * Puts the current duel off: the challenger goes to the end and comes back once the others of
 * this place were played. Null when there is nothing to put off (it is the last challenger).
 */
export function skip(r: Ranking): Ranking | null {
  if (!current(r) || r.next >= r.order.length - 1) return null
  const order = [...r.order]
  order.push(...order.splice(r.next, 1))
  return { ...r, order }
}

/** Moves on to the next place once everyone after the current one was compared. */
function finish(r: Ranking): Ranking {
  let { settled, next } = r
  if (next >= r.order.length) {
    settled += 1
    next = settled + 1
  }
  return { order: r.order, settled: Math.min(settled, r.order.length), next: Math.min(next, r.order.length) }
}

/** How many duels are left until the first place – and until every place – is decided. */
export function remaining(r: Ranking): { toFirst: number; toAll: number } {
  const n = r.order.length
  const inPlace = Math.max(0, n - r.next)
  let toAll = finished(r) ? 0 : inPlace
  for (let place = r.settled + 1; place < n - 1; place++) toAll += n - place - 1
  return { toFirst: r.settled === 0 ? inPlace : 0, toAll }
}

/**
 * A joint ranking of everyone's own: products by their average place (1 = best); a product a
 * person has not ranked counts as their last place. Ties keep `fallback` order.
 */
export function joint(rankings: Ranking[], fallback: string[]): { id: string; average: number }[] {
  const n = fallback.length
  return fallback
    .map((id, i) => {
      const places = rankings.map((r) => {
        const at = r.order.indexOf(id)
        return at < 0 ? n : at + 1
      })
      return { id, average: places.length ? places.reduce((a, b) => a + b, 0) / places.length : i + 1, i }
    })
    .sort((a, b) => a.average - b.average || a.i - b.i)
    .map(({ id, average }) => ({ id, average }))
}

/**
 * What a person duels: their own preselection – the products they starred or liked, nothing
 * excluded – starred ones first, table order within.
 */
export function startOrder(products: Product[], userId: string): string[] {
  return products
    .filter((p) => p.candidate !== 'excluded' && (isFavorite(p, userId) || p.votes?.[userId] === 'like'))
    .map((p, i) => ({ id: p.id, w: isFavorite(p, userId) ? 0 : 1, i }))
    .sort((a, b) => a.w - b.w || a.i - b.i)
    .map((x) => x.id)
}

/**
 * Everyone's rankings, each over that person's own preselection, and all products in any of them
 * (in table order) – what the joint ranking is about.
 */
export function everyone(rankings: Record<string, Ranking> | undefined, products: Product[]): { states: [string, Ranking][]; all: string[] } {
  const states = Object.entries(rankings ?? {}).map(([id, r]): [string, Ranking] => [id, normalize(r, startOrder(products, id))])
  const inAny = new Set(states.flatMap(([, r]) => r.order))
  return { states, all: products.filter((p) => inAny.has(p.id)).map((p) => p.id) }
}

/**
 * Each product's place for the table: jointly when several people have duelled, else from the
 * one ranking there is. Empty when nobody has duelled yet; products in nobody's preselection
 * (and excluded ones) have no place.
 */
export function places(rankings: Record<string, Ranking> | undefined, products: Product[]): Map<string, number> {
  const { states, all } = everyone(rankings, products)
  if (!states.length) return new Map()
  return new Map(
    joint(
      states.map(([, r]) => r),
      all,
    ).map((x, i) => [x.id, i + 1]),
  )
}
