import { describe, expect, it } from 'vitest'
import { apply, boxQuad, homography, quadBox, rectify, UNIT, type Quad } from '../src/domain/rectify'

describe('straightening a photo taken from an angle', () => {
  // The front of a cabinet photographed from the left: its right edge further away, so shorter.
  const front: Quad = [
    { x: 0.2, y: 0.1 },
    { x: 0.7, y: 0.2 },
    { x: 0.7, y: 0.8 },
    { x: 0.2, y: 0.9 },
  ]

  it('maps the corners of the square onto the front’s corners', () => {
    const h = homography(UNIT, front)!
    UNIT.forEach((p, i) => {
      expect(apply(h, p).x).toBeCloseTo(front[i].x)
      expect(apply(h, p).y).toBeCloseTo(front[i].y)
    })
    // Perspective, not a stretch: the front's middle is where the quad's diagonals cross –
    // towards the far, shorter edge (x = 0.2 + 0.5 · 4/7), not the box's middle (0.45).
    expect(apply(h, { x: 0.5, y: 0.5 }).x).toBeCloseTo(0.2 + 0.5 * (4 / 7))
  })

  it('says when the corners cannot make a front', () => {
    const line: Quad = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
      { x: 0.2, y: 0 },
    ]
    expect(homography(UNIT, line)).toBeNull()
  })

  it('copies the photo straight when the corners are the whole picture', () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255])
    expect([...rectify(src, 2, 2, UNIT, 2, 2)!]).toEqual([...src])
  })

  it('takes the colour from inside the corners', () => {
    // A 4 × 4 photo: left half red, right half blue; the corners take the right half only.
    const src = new Uint8ClampedArray(4 * 4 * 4)
    for (let i = 0; i < 16; i++) src.set(i % 4 < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4)
    const right = rectify(src, 4, 4, boxQuad({ x: 0.5, y: 0, w: 0.5, h: 1 }), 2, 2)!
    expect([...right.slice(0, 4)]).toEqual([0, 0, 255, 255])
  })

  it('knows the box around corners and the corners of a box', () => {
    expect(quadBox(front)).toEqual({ x: 0.2, y: 0.1, w: 0.49999999999999994, h: 0.8 })
    expect(boxQuad({ x: 0.1, y: 0.2, w: 0.5, h: 0.6 })[2]).toEqual({ x: 0.6, y: 0.8 })
  })
})
