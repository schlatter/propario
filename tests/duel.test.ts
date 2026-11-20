import { describe, expect, it } from 'vitest'
import { current, decide, finished, joint, normalize, places, remaining, skip, startOrder } from '../src/domain/duel'
import { makeProduct } from '../src/db/factories'

const ids = ['a', 'b', 'c', 'd']

/** Plays every duel with a fixed taste: the better product is the one earlier in `taste`. */
function play(taste: string[], start = normalize(undefined, ids)) {
  let r = start
  let duels = 0
  for (let pair = current(r); pair; pair = current(r)) {
    r = decide(r, taste.indexOf(pair.left) < taste.indexOf(pair.right) ? 'left' : 'right')
    duels++
  }
  return { r, duels }
}

describe('ranking by duels', () => {
  it('always puts the place holder left and the next challenger right', () => {
    const r = normalize(undefined, ids)
    expect(current(r)).toEqual({ left: 'a', right: 'b' })
    expect(current(decide(r, 'left'))).toEqual({ left: 'a', right: 'c' })
    // The challenger wins: it takes the place and stays on the left.
    expect(current(decide(r, 'right'))).toEqual({ left: 'b', right: 'c' })
  })

  it('decides the first place after n − 1 duels', () => {
    let r = normalize(undefined, ids)
    expect(remaining(r)).toEqual({ toFirst: 3, toAll: 6 })
    for (const side of ['right', 'left', 'right'] as const) r = decide(r, side)
    expect(r.settled).toBe(1)
    expect(r.order[0]).toBe('d')
    expect(remaining(r).toFirst).toBe(0)
  })

  it('ends with the order of taste, whatever the start', () => {
    const taste = ['c', 'a', 'd', 'b']
    const { r, duels } = play(taste)
    expect(finished(r)).toBe(true)
    expect(r.order).toEqual(taste)
    expect(duels).toBe(6)
    expect(current(r)).toBeNull()
  })

  it('takes in products added later, and starts a place over when a product of its duels left', () => {
    let r = decide(normalize(undefined, ids), 'left') // a beat b; a vs c next
    r = normalize(r, [...ids, 'e'])
    expect(r.order).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(current(r)).toEqual({ left: 'a', right: 'c' })
    // b, already beaten, is excluded: the place is played again from the start.
    r = normalize(r, ['a', 'c', 'd', 'e'])
    expect(current(r)).toEqual({ left: 'a', right: 'c' })
    expect(r.settled).toBe(0)
    // A decided first place stays decided when someone further down leaves.
    const done = play(['a', 'b', 'c', 'd']).r
    expect(normalize(done, ['a', 'b', 'd']).settled).toBeGreaterThanOrEqual(2)
    // … but not when the winner itself leaves.
    expect(normalize({ order: ['a', 'b', 'c'], settled: 1, next: 2 }, ['b', 'c'])).toMatchObject({ order: ['b', 'c'], settled: 0, next: 1 })
  })

  it('has nothing to play with fewer than two products', () => {
    expect(current(normalize(undefined, ['a']))).toBeNull()
    expect(current(normalize(undefined, []))).toBeNull()
  })

  it('joins everyone’s rankings by the average place', () => {
    const ada = { order: ['a', 'b', 'c'], settled: 2, next: 3 }
    const grace = { order: ['b', 'a', 'c'], settled: 2, next: 3 }
    expect(joint([ada, grace], ['a', 'b', 'c']).map((x) => x.id)).toEqual(['a', 'b', 'c'])
    // Opposite tastes tie everything: the table's order decides.
    expect(joint([ada, { order: ['c', 'b', 'a'], settled: 0, next: 1 }], ['a', 'b', 'c'])).toEqual([
      { id: 'a', average: 2 },
      { id: 'b', average: 2 },
      { id: 'c', average: 2 },
    ])
    // Someone who has not ranked a product counts it last.
    expect(joint([ada, { order: ['b'], settled: 0, next: 1 }], ['a', 'b', 'c'])[0]).toEqual({ id: 'b', average: 1.5 })
  })

  it('puts a duel off: the challenger comes back last in this place', () => {
    const r = normalize(undefined, ids)
    const later = skip(r)!
    expect(current(later)).toEqual({ left: 'a', right: 'c' })
    expect(later.order).toEqual(['a', 'c', 'd', 'b'])
    // Nothing to put off when it is the last challenger of the place.
    expect(skip(decide(decide(r, 'left'), 'left'))).toBeNull()
    // Putting off loses nothing: the order still ends as the taste says.
    expect(play(['b', 'd', 'a', 'c'], later).r.order).toEqual(['b', 'd', 'a', 'c'])
  })

  it('duels only one’s own preselection: starred first, then liked; nothing excluded', () => {
    const pid = '00000000-0000-4000-8000-000000000000'
    const liked = makeProduct(pid, { votes: { ada: 'like' } })
    const starred = makeProduct(pid, { favorites: { ada: true } })
    const neutral = makeProduct(pid, { votes: { ada: 'neutral' } })
    const theirs = makeProduct(pid, { votes: { grace: 'like' } })
    const out = makeProduct(pid, { votes: { ada: 'like' }, candidate: 'excluded' })
    expect(startOrder([liked, starred, neutral, theirs, out], 'ada')).toEqual([starred.id, liked.id])
    expect(startOrder([liked, starred, neutral, theirs, out], 'grace')).toEqual([theirs.id])
  })

  it('gives the table a place per product: joint, or from the one ranking there is', () => {
    const pid = '00000000-0000-4000-8000-000000000000'
    const [a, b, c] = [0, 1, 2].map(() => makeProduct(pid, { votes: { grace: 'like', ada: 'like' } }))
    const x = makeProduct(pid, { candidate: 'excluded', votes: { grace: 'like' } })
    const other = makeProduct(pid)
    const list = [a, b, c, x, other]
    expect(places(undefined, list).size).toBe(0)
    const grace = { order: [c.id, a.id, b.id], settled: 2, next: 3 }
    expect([...places({ grace }, list)]).toEqual([
      [c.id, 1],
      [a.id, 2],
      [b.id, 3],
    ])
    // Excluded or in nobody's preselection: no place.
    expect(places({ grace }, list).has(x.id)).toBe(false)
    expect(places({ grace }, list).has(other.id)).toBe(false)
    // Two people: by the average place; Ada has not ranked yet – her order is her preselection.
    const ada = { order: [a.id, b.id, c.id], settled: 0, next: 1 }
    expect(places({ grace, ada }, list).get(a.id)).toBe(1)
  })
})
