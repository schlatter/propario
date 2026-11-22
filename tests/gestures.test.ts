import { describe, expect, it } from 'vitest'
import { angleBetween, atEdge, follow, Gestures, lerpAngle, TAP_SLOP, wrap } from '../src/domain/gestures'

const width = () => 400

describe('touches over the room view', () => {
  it('a finger down and up without moving is a tap', () => {
    const g = new Gestures(width)
    g.down(1, { x: 100, y: 100 })
    expect(g.move(1, { x: 100 + TAP_SLOP / 2, y: 100 })).toBeNull()
    expect(g.up(1)).toEqual({ kind: 'tap' })
  })

  it('a finger moved sideways turns – right turns it right – and is no tap', () => {
    const g = new Gestures(width)
    g.down(1, { x: 100, y: 100 })
    expect(g.move(1, { x: 120, y: 100 })?.kind).toBe('turn')
    // 100 px of a 400 px wide screen: a quarter of half a turn.
    expect(g.move(1, { x: 220, y: 100 })).toEqual({ kind: 'turn', by: -Math.PI / 4 })
    expect(g.up(1)).toBeNull()
  })

  it('two fingers twisted turn by the angle between them, and their release is no tap', () => {
    const g = new Gestures(width)
    g.down(1, { x: 100, y: 200 })
    g.down(2, { x: 300, y: 200 })
    // The right finger goes down by as much as the fingers are apart: a quarter turn of the line.
    const turn = g.move(2, { x: 100 + 200 * Math.cos(Math.PI / 4), y: 200 + 200 * Math.sin(Math.PI / 4) })
    expect(turn?.kind).toBe('turn')
    expect((turn as { by: number }).by).toBeCloseTo(-Math.PI / 4)
    expect(g.up(2)).toBeNull()
    expect(g.up(1)).toBeNull()
  })

  it('ignores fingers it does not know', () => {
    const g = new Gestures(width)
    expect(g.move(9, { x: 0, y: 0 })).toBeNull()
    expect(g.up(9)).toBeNull()
  })
})

describe('smooth movement', () => {
  it('measures turns and wraps angles into one turn', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2)
    expect(wrap(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(wrap((-3 * Math.PI) / 2)).toBeCloseTo(Math.PI / 2)
  })

  it('turns the short way round', () => {
    // From just below +180° to just above −180°: a small step forward, not almost a full turn back.
    const step = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)
    expect(wrap(step)).toBeCloseTo(Math.PI)
  })

  it('settles in about a tenth of a second at any frame rate', () => {
    expect(follow(0)).toBe(0)
    expect(follow(0.1)).toBeCloseTo(1 - Math.exp(-1))
    // Two frames of 30 Hz move as far as four of 60 Hz.
    const at60 = 1 - (1 - follow(1 / 60)) ** 4
    const at30 = 1 - (1 - follow(1 / 30)) ** 2
    expect(at60).toBeCloseTo(at30)
  })
})

describe('the edges belong to the phone', () => {
  it('leaves touches at the sides and the top to the back gesture, reads the ones further in', () => {
    expect(atEdge({ x: 10, y: 400 }, 400, 800)).toBe(true)
    expect(atEdge({ x: 395, y: 400 }, 400, 800)).toBe(true)
    expect(atEdge({ x: 200, y: 10 }, 400, 800)).toBe(true)
    expect(atEdge({ x: 200, y: 400 }, 400, 800)).toBe(false)
  })
})
