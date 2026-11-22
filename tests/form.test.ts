import { describe, expect, it } from 'vitest'
import { addPart, fitShape, formFromProfiles, moveCut, profileSteps, removePart, rowExtents, splitAt } from '../src/domain/form'
import { drawnSize } from '../src/domain/size'

const size = { width: 100, height: 200, depth: 40 }

describe('a form divides the size, never changes it', () => {
  it('splits into two parts as wide and deep as the whole', () => {
    expect(splitAt(size, 90)).toEqual([
      { w: 100, h: 90, d: 40 },
      { w: 100, h: 110, d: 40 },
    ])
  })

  it('moves a cut: the part above gives or takes, the height stays', () => {
    const moved = moveCut(splitAt(size, 90), 0, 120)
    expect(moved.map((p) => p.h)).toEqual([120, 80])
    expect(moveCut(splitAt(size, 90), 0, 500).map((p) => p.h)).toEqual([199, 1])
  })

  it('adds a part by halving the top and removes one into its neighbour', () => {
    const three = addPart(splitAt(size, 90))
    expect(three.map((p) => p.h)).toEqual([90, 55, 55])
    expect(removePart(three, 1).map((p) => p.h)).toEqual([90, 110])
    expect(removePart(three, 2).map((p) => p.h)).toEqual([90, 110])
    // Two parts less one is one box again: no form.
    expect(removePart(splitAt(size, 90), 0)).toEqual([])
  })

  it('fits a saved form into the size: heights scaled, nothing wider or deeper', () => {
    const fitted = fitShape(
      [
        { w: 120, h: 90, d: 40 },
        { w: 90, h: 100, d: 33 },
      ],
      size,
    )
    expect(fitted.map((p) => Math.round(p.h * 100) / 100)).toEqual([94.74, 105.26])
    expect(fitted[0].w).toBe(100)
    expect(fitted[1]).toMatchObject({ w: 90, d: 33 })
  })

  it('draws the fields’ size; the form’s own only without complete fields', () => {
    expect(drawnSize(size, [{ w: 90, h: 100, d: 33 }])).toEqual(size)
    expect(drawnSize({ width: 100 }, [{ w: 90, h: 100, d: 33 }])).toEqual({ width: 90, height: 100, depth: 33 })
  })
})

describe('reading a form from a drawing', () => {
  /** A white picture with filled boxes (x0, x1, y0, y1 in pixels) drawn dark. */
  function picture(w: number, h: number, boxes: number[][]) {
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255)
    for (const [x0, x1, y0, y1] of boxes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) rgba.set([40, 40, 40, 255], (y * w + x) * 4)
    return rgba
  }

  // A buffet from the side, 40 px deep below and 33 px above: the top part 110 rows, the base 90.
  const side = picture(40, 200, [
    [7, 40, 0, 110],
    [0, 40, 110, 200],
  ])

  it('measures each row from its first to its last dark pixel', () => {
    const rows = rowExtents(side, 40, 200)
    expect(rows[0]).toBeCloseTo(33 / 40)
    expect(rows[199]).toBe(1)
    expect(rowExtents(picture(4, 2, []), 4, 2)).toEqual([null, null])
  })

  it('finds the step and its heights, from the bottom up', () => {
    const steps = profileSteps(rowExtents(side, 40, 200))
    expect(steps).toHaveLength(2)
    expect(steps[0].h).toBeCloseTo(0.45, 1)
    expect(steps[1].v).toBeCloseTo(33 / 40, 2)
  })

  it('ignores thin lines and figures – a shelf, a moulding – and sees one box where there is no step', () => {
    const plain = picture(40, 200, [
      [0, 40, 0, 200],
      [0, 46, 60, 63],
    ])
    expect(profileSteps(rowExtents(plain, 40, 200))).toHaveLength(1)
  })

  it('reads a line drawing as IKEA draws them: outlines, shelves, a handle and a figure inside', () => {
    const w = 80
    const h = 300
    const lines = [
      // Base 0–80 px deep from row 160 down, top 14–80 px from row 0 to 160 (outline only, 2 px).
      [0, 80, 160, 162],
      [0, 80, 298, 300],
      [0, 2, 160, 300],
      [78, 80, 0, 300],
      [14, 80, 0, 2],
      [14, 16, 0, 160],
      // Shelves inside, a handle sticking out a little, a figure "37".
      [16, 78, 60, 61],
      [2, 78, 230, 231],
      [10, 12, 100, 104],
      [30, 44, 200, 212],
    ]
    const steps = profileSteps(rowExtents(picture(w, h, lines), w, h))
    expect(steps).toHaveLength(2)
    expect(steps[0].h).toBeCloseTo(140 / 300, 1)
    expect(steps[1].v).toBeCloseTo(66 / 80, 1)
  })

  it('turns the steps into a form of the product’s size, the top taking the rest', () => {
    const form = formFromProfiles(size, profileSteps(rowExtents(side, 40, 200)))
    expect(form.map((p) => p.d)).toEqual([40, 33])
    expect(form.reduce((n, p) => n + p.h, 0)).toBe(200)
    expect(form[0].h).toBeCloseTo(90, 0)
    // With a front drawing: the upper part narrower.
    const front = picture(100, 200, [
      [5, 95, 0, 110],
      [0, 100, 110, 200],
    ])
    const withFront = formFromProfiles(size, profileSteps(rowExtents(side, 40, 200)), rowExtents(front, 100, 200))
    expect(withFront.map((p) => p.w)).toEqual([100, 90])
    expect(formFromProfiles(size, [{ h: 1, v: 1 }])).toEqual([])
  })
})
