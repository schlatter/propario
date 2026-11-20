import { describe, expect, it } from 'vitest'
import { current, decide, finished, joint, normalize, remaining } from '../src/domain/duel'

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
})
