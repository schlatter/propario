import { describe, expect, it } from 'vitest'
import { arrange, cameraDistance, cropToUv, frontSlice, GAP_M, partsOf, PERSON_M, sideSlice } from '../src/domain/scene'
import { partRects, shapeSize } from '../src/domain/size'

describe('arrange', () => {
  it('stands boxes of the real size side by side, centred, the person on the left', () => {
    const { boxes, personX } = arrange([
      { id: 'a', size: { width: 85, height: 188, depth: 37 } },
      { id: 'b', size: { width: 108, height: 197, depth: 45 } },
    ])
    expect(boxes.map((b) => [b.w, b.h, b.d])).toEqual([
      [0.85, 1.88, 0.37],
      [1.08, 1.97, 0.45],
    ])
    const total = 0.85 + 1.08 + GAP_M
    expect(boxes[0].x).toBeCloseTo(-total / 2 + 0.425)
    expect(boxes[1].x - boxes[0].x).toBeCloseTo(0.425 + GAP_M + 0.54)
    expect(personX).toBeCloseTo(-total / 2 - GAP_M - PERSON_M.w / 2)
  })

  it('leaves out products that miss a side – a box needs all three', () => {
    expect(arrange([{ id: 'a', size: { width: 85, height: 188 } }]).boxes).toEqual([])
  })
})

describe('cropToUv', () => {
  it('turns a crop counted from the top into texture coordinates counted from the bottom', () => {
    expect(cropToUv({ x: 0.2, y: 0.1, w: 0.5, h: 0.6 })).toEqual({ repeat: [0.5, 0.6], offset: [0.2, 1 - 0.1 - 0.6] })
    expect(cropToUv(null)).toEqual({ repeat: [1, 1], offset: [0, 0] })
  })
})

describe('cameraDistance', () => {
  it('steps back further for a wider group or a narrower screen', () => {
    const wide = cameraDistance(3, 1, 40, 1.5)
    expect(cameraDistance(1, 1, 40, 1.5)).toBeLessThan(wide)
    expect(cameraDistance(3, 1, 40, 0.5)).toBeGreaterThan(wide)
  })
})

describe('products of several parts', () => {
  // A buffet: the lower part 90 × 85 × 40, the upper part narrower and shallower, 86 × 95 × 33.
  const shape = [
    { w: 90, h: 85, d: 40 },
    { w: 86, h: 95, d: 33 },
  ]

  it('stacks the parts from the floor, backs flush against the wall', () => {
    const p = partsOf({ width: 90, height: 180, depth: 40 }, shape)!
    expect([p.w, p.h, p.d]).toEqual([0.9, 1.8, 0.4])
    expect(p.parts.map((x) => x.y0)).toEqual([0, 0.85])
    // Both backs at z = −0.2: the upper part's front is 7 cm further back.
    expect(p.parts.map((x) => x.z - x.d / 2)).toEqual([-0.2, -0.2])
    expect(p.parts[1].z + p.parts[1].d / 2).toBeCloseTo(0.13)
  })

  it('takes its size from the form, and without a form is one box from the fields', () => {
    expect(partsOf({ width: 80 }, shape)?.h).toBeCloseTo(1.8)
    expect(partsOf({ width: 85, height: 188, depth: 37 })!.parts).toHaveLength(1)
    expect(partsOf({ width: 85, height: 188 }, [])).toBeNull()
  })

  it('gives each part its slice of the front and the side picture', () => {
    const p = partsOf({}, shape)!
    const whole = { w: p.w, h: p.h, d: p.d }
    const crop = { x: 0, y: 0, w: 1, h: 1 }
    const lower = frontSlice(crop, p.parts[0], whole)
    expect(lower.y).toBeCloseTo(95 / 180)
    expect(lower.h).toBeCloseTo(85 / 180)
    const upper = frontSlice(crop, p.parts[1], whole)
    expect(upper.y).toBeCloseTo(0)
    expect(upper.x).toBeCloseTo(2 / 90)
    expect(upper.w).toBeCloseTo(86 / 90)
    // From the side, with the front at the left: the shallower upper part is the back 33 of 40 cm.
    expect(sideSlice(crop, p.parts[1], whole).x).toBeCloseTo(7 / 40)
  })

  it('draws the parts in each view to scale', () => {
    expect(shapeSize(shape)).toEqual({ width: 90, height: 180, depth: 40 })
    expect(partRects('side', shape)).toEqual([
      { a0: 0, a: 40, b0: 0, b: 85 },
      { a0: 0, a: 33, b0: 85, b: 95 },
    ])
    expect(partRects('front', shape)[1]).toEqual({ a0: -43, a: 86, b0: 85, b: 95 })
    expect(partRects('top', shape)[1]).toEqual({ a0: -43, a: 86, b0: 0, b: 33 })
  })
})

describe('a form on the server and in old records', () => {
  it('accepts up to six parts of width, height and depth, nothing else', async () => {
    const { checkFields, sanitize } = await import('../src/shared/records')
    const { makeProduct } = await import('../src/db/factories')
    expect(checkFields('products', { shape: [{ w: 90, h: 85, d: 40 }] })).toBeNull()
    expect(checkFields('products', { shape: [{ w: 90, h: 85 }] })).toMatch(/shape/)
    expect(checkFields('products', { shape: [{ w: 90, h: 85, d: -1 }] })).toMatch(/shape/)
    expect(checkFields('products', { shape: Array(7).fill({ w: 1, h: 1, d: 1 }) })).toMatch(/shape/)
    const p = makeProduct('00000000-0000-4000-8000-000000000000', {
      shape: [
        { w: 90, h: 85, d: 40 },
        { w: 0, h: 1, d: 1 },
      ],
    })
    expect(sanitize('products', p).shape).toEqual([{ w: 90, h: 85, d: 40 }])
  })
})
