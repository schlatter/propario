import { describe, expect, it } from 'vitest'
import { makeProduct, makeProperty, makeRequirement } from '../src/db/factories'
import { contentBox, fitsFront, scaleToFit, sizeFields, sizeLimits, sizeOf, toCm, viewsFor } from '../src/domain/size'

const width = makeProperty('p', { name: 'Breite', type: 'number', unit: 'cm', order: 0 })
const height = makeProperty('p', { name: 'Höhe', type: 'number', unit: 'cm', order: 1 })
const depth = makeProperty('p', { name: 'Tiefe', type: 'number', unit: 'cm', order: 2 })
// Look alike, but are no outer size: a yes/no check and an inner height.
const depthOk = makeProperty('p', { name: 'Tiefe ≤ 40', type: 'boolean', order: 3 })
const shelf = makeProperty('p', { name: 'Freie Fachhöhe', type: 'number', unit: 'cm', order: 4 })
const props = [shelf, depthOk, depth, height, width]
const fields = sizeFields(props)

const limit = (propertyId: string, op: 'lte' | 'lt' | 'gt' | 'gte', value: number | string, priority: 'must' | 'wish' | 'avoid' | 'info' = 'must') =>
  makeRequirement('p', { priority, condition: { target: { kind: 'property', propertyId }, op, value } })

describe('sizeFields', () => {
  it('finds width, height and depth by name and skips look-alikes', () => {
    expect(fields.width?.id).toBe(width.id)
    expect(fields.height?.id).toBe(height.id)
    expect(fields.depth?.id).toBe(depth.id)
  })

  it('knows English names and prefixes, and ignores fields in no length unit', () => {
    const f = sizeFields([
      makeProperty('p', { name: 'Width', type: 'number', unit: 'mm' }),
      makeProperty('p', { name: 'Gesamthöhe', type: 'number', unit: '' }),
      makeProperty('p', { name: 'Depth', type: 'number', unit: 'kg' }),
    ])
    expect(f.width?.name).toBe('Width')
    expect(f.height?.name).toBe('Gesamthöhe')
    expect(f.depth).toBeUndefined()
  })

  it('finds nothing in a comparison without sizes', () => {
    expect(sizeFields([makeProperty('p', { name: 'RAM', type: 'number', unit: 'GB' })])).toEqual({})
  })
})

describe('toCm', () => {
  it('converts the usual length units; no unit counts as cm', () => {
    expect(toCm(850, 'mm')).toBe(85)
    expect(toCm(1.9, 'm')).toBe(190)
    expect(toCm(40, '')).toBe(40)
    expect(toCm(10, 'in')).toBeCloseTo(25.4)
    expect(toCm(3, 'kg')).toBeNull()
  })
})

describe('sizeOf', () => {
  it('reads the known sides and leaves out missing or unusable ones', () => {
    const p = makeProduct('p', { values: { [width.id]: 85, [height.id]: 188, [depth.id]: 'ca. 37' } })
    expect(sizeOf(p, fields)).toEqual({ width: 85, height: 188 })
    expect(sizeOf(makeProduct('p', { values: { [width.id]: 0 } }), fields)).toEqual({})
  })
})

describe('sizeLimits', () => {
  it('takes the tightest "at most" per side', () => {
    const rules = [limit(depth.id, 'lte', 45, 'wish'), limit(depth.id, 'lte', 40), limit(width.id, 'lt', '110', 'wish')]
    const l = sizeLimits(rules, fields)
    expect(l.depth).toMatchObject({ max: 40, priority: 'must' })
    expect(l.width).toMatchObject({ max: 110, priority: 'wish' })
    expect(l.height).toBeUndefined()
  })

  it('reads "avoid more than" as a limit, ignores minimums, info rows and other fields', () => {
    const rules = [limit(height.id, 'gt', 200, 'avoid'), limit(width.id, 'gte', 60), limit(depth.id, 'lte', 30, 'info'), limit(shelf.id, 'lte', 20)]
    expect(sizeLimits(rules, fields)).toEqual({ height: expect.objectContaining({ max: 200 }) })
  })

  it('converts the limit with the field unit', () => {
    const mm = makeProperty('p', { name: 'Breite', type: 'number', unit: 'mm' })
    expect(sizeLimits([limit(mm.id, 'lte', 1100)], sizeFields([mm])).width?.max).toBe(110)
  })
})

describe('viewsFor', () => {
  it('offers a view only when enough products have both of its sides', () => {
    const sizes = [
      { width: 85, height: 188, depth: 37 },
      { width: 90, height: 185 },
    ]
    expect(viewsFor(sizes)).toEqual(['front', 'side', 'top'])
    expect(viewsFor(sizes, 2)).toEqual(['front'])
    expect(viewsFor([{}, {}])).toEqual([])
  })
})

describe('contentBox', () => {
  /** A white picture with one dark block at the given pixels. */
  function picture(w: number, h: number, block: { x: number; y: number; w: number; h: number } | null) {
    const rgba = new Uint8ClampedArray(w * h * 4).fill(255)
    if (block) for (let y = block.y; y < block.y + block.h; y++) for (let x = block.x; x < block.x + block.w; x++) rgba.set([90, 70, 50, 255], (y * w + x) * 4)
    return rgba
  }

  it('finds the object on white', () => {
    expect(contentBox(picture(10, 20, { x: 2, y: 4, w: 5, h: 10 }), 10, 20)).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
  })

  it('keeps the whole picture when nothing stands out, and skips transparent pixels', () => {
    expect(contentBox(picture(4, 4, null), 4, 4)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    const clear = new Uint8ClampedArray(4 * 4 * 4) // all transparent black
    expect(contentBox(clear, 4, 4)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('fitsFront', () => {
  it('uses a picture only when its shape matches width and height', () => {
    // A cabinet photographed straight on: 0.45 : 1 in a square picture, 85 × 188 real.
    expect(fitsFront({ x: 0.27, y: 0, w: 0.45, h: 1 }, 1, 85, 188)).toBe(true)
    // A room shot of the same cabinet: the whole wide picture.
    expect(fitsFront({ x: 0, y: 0, w: 1, h: 1 }, 1.5, 85, 188)).toBe(false)
  })
})

describe('scaleToFit', () => {
  it('fills the width when height allows, and keeps to the height cap', () => {
    expect(scaleToFit([100, 100], 0, 400, 50, 10, 0.2)).toBeCloseTo(2)
    expect(scaleToFit([100, 100], 0, 4000, 50, 1.5, 0.2)).toBe(1.5)
  })

  it('counts each column at least as wide as its caption', () => {
    // Three wide sideboards and a person on a phone: everything still fits.
    const k = scaleToFit([180, 180, 200], 64 + 12 * 5, 358, 64, 1.3, 0.2)!
    expect([180, 180, 200].reduce((n, c) => n + Math.max(c * k, 64), 64 + 60)).toBeLessThanOrEqual(358)
    expect(k).toBeGreaterThan(0.3)
  })

  it('says so when nothing fits even at the floor', () => {
    expect(scaleToFit([100, 100, 100], 0, 100, 50, 2, 0.6)).toBeNull()
  })
})
