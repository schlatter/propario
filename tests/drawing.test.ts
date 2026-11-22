import { describe, expect, it } from 'vitest'
import { drawingViews, isAnnotation, isInk, objectColor } from '../src/domain/drawing'

/** A white picture; boxes [x0, x1, y0, y1] filled with a colour. */
function picture(w: number, h: number, boxes: [number, number, number, number, [number, number, number]][]) {
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255)
  for (const [x0, x1, y0, y1, c] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgba.set([...c, 255], (y * w + x) * 4)
  return rgba
}
const black: [number, number, number] = [30, 30, 30]
const blue: [number, number, number] = [30, 80, 170]

describe('a dimension drawing', () => {
  it('tells product lines from dimension lines by colour', () => {
    expect(isInk(...black)).toBe(true)
    expect(isInk(...blue)).toBe(false)
    expect(isInk(250, 250, 250)).toBe(false)
    expect(isAnnotation(...blue)).toBe(true)
    expect(isAnnotation(...black)).toBe(false)
    // The muted blue of a downscaled IKEA drawing is still a dimension line.
    expect(isInk(75, 99, 120)).toBe(false)
    expect(isAnnotation(75, 99, 120)).toBe(true)
  })

  it('finds the front and the side as IKEA draws them, ignoring the blue dimension lines between', () => {
    // 200 × 100 px: the front 60 px wide, the side 25 px wide, blue lines and a figure around them.
    const rgba = picture(200, 100, [
      [20, 80, 10, 90, black],
      [140, 165, 10, 90, black],
      [20, 80, 2, 4, blue],
      [100, 102, 10, 90, blue],
      [110, 130, 40, 50, blue],
    ])
    const v = drawingViews(rgba, 200, 100)
    expect(v.front).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.8 })
    expect(v.side).toEqual({ x: 0.7, y: 0.1, w: 0.125, h: 0.8 })
  })

  it('gives a drawing of one view as the front, and leaves out small marks', () => {
    const one = picture(100, 100, [
      [10, 60, 5, 95, black],
      [80, 85, 10, 14, black],
    ])
    expect(drawingViews(one, 100, 100)).toEqual({ front: { x: 0.1, y: 0.05, w: 0.5, h: 0.9 }, side: null })
    expect(drawingViews(picture(10, 10, []), 10, 10)).toEqual({ front: null, side: null })
  })

  it('takes no lone tall line for a side view – a dimension line drawn dark', () => {
    const rgba = picture(200, 100, [
      [40, 140, 10, 90, black],
      [20, 22, 10, 90, black],
    ])
    expect(drawingViews(rgba, 200, 100).side).toBeNull()
  })

  it('takes the product’s colour from a photo on white', () => {
    const photo = picture(10, 10, [[2, 8, 2, 8, [110, 140, 100]]])
    expect(objectColor(photo)).toEqual([110, 140, 100])
    expect(objectColor(picture(4, 4, []))).toBeNull()
  })
})
