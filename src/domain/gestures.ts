/**
 * Touches over the room view (src/pages/project/Model3D.tsx), read without the browser: a tap
 * sets the product down, two fingers twisted turn it.
 */

/** Moved less than this (px) between down and up: a tap. */
export const TAP_SLOP = 12

export interface Point {
  x: number
  y: number
}

export type GestureEvent = { kind: 'turn'; by: number } | { kind: 'tap' } | null

/**
 * Follows the fingers on the screen. `down`, `move` and `up` say what happened; `move` gives the
 * turn since the last move, `up` a tap when one finger went down and up without moving.
 */
export class Gestures {
  private points = new Map<number, Point>()
  private start: Point | null = null
  private moved = false
  private many = false

  down(id: number, p: Point): GestureEvent {
    this.points.set(id, p)
    if (this.points.size === 1) {
      this.start = p
      this.moved = false
      this.many = false
    } else this.many = true
    return null
  }

  move(id: number, p: Point): GestureEvent {
    const before = this.points.get(id)
    if (!before) return null
    if (this.points.size === 2) {
      const [a, b] = [...this.points.entries()]
      const other = a[0] === id ? b[1] : a[1]
      this.points.set(id, p)
      this.moved = true
      // Two fingers: the turn of the line between them – like turning a knob.
      return { kind: 'turn', by: -angleBetween(before, other, p, other) }
    }
    this.points.set(id, p)
    // One finger only ever taps: a moved finger is no tap, and it turns nothing – over the
    // camera picture, a swipe is too easily the phone's own gesture. Turning is the strip's and
    // two fingers' job.
    if (this.start && Math.hypot(p.x - this.start.x, p.y - this.start.y) >= TAP_SLOP) this.moved = true
    return null
  }

  up(id: number): GestureEvent {
    if (!this.points.delete(id)) return null
    if (this.points.size > 0) return null
    const tap = !this.moved && !this.many
    this.start = null
    return tap ? { kind: 'tap' } : null
  }
}

/** How far the line from a0 to b0 turned to become the line from a1 to b1, radians in (−π, π]. */
export function angleBetween(a0: Point, b0: Point, a1: Point, b1: Point): number {
  const d = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)
  return wrap(d)
}

/** An angle in (−π, π]. */
export const wrap = (a: number) => {
  let r = a % (2 * Math.PI)
  if (r <= -Math.PI) r += 2 * Math.PI
  if (r > Math.PI) r -= 2 * Math.PI
  return r
}

/** A step of `t` (0 … 1) from one angle towards another, the short way round. */
export const lerpAngle = (from: number, to: number, t: number) => from + wrap(to - from) * t

/**
 * How much of the way to go in one frame so that a jittery position settles smoothly but still
 * follows quickly: about a tenth of a second whatever the frame rate.
 */
export const follow = (dtSeconds: number, settle = 0.1) => 1 - Math.exp(-Math.max(0, dtSeconds) / settle)

/**
 * A touch that starts at the edge of the screen belongs to the phone: Android's back gesture
 * (from the sides) and leaving full screen (from the top) end the room view. The page leaves
 * those to the phone and reads only touches further in.
 */
export const EDGE = 40
export const atEdge = (p: Point, width: number, height: number, margin = EDGE) => p.x < margin || p.x > width - margin || p.y < margin || p.y > height - margin
