import { describe, expect, it } from 'vitest'
import { arrange, cameraDistance, cropToUv, GAP_M, PERSON_M } from '../src/domain/scene'

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
