import { describe, expect, it } from 'vitest'
import { makeProduct } from '../src/db/factories'
import { markView, remapViews, viewsOf, viewsWithout, withAdded, withMain, without } from '../src/domain/pictures'
import { checkFields, sanitize } from '../src/shared/records'

const MAX = 8
const main = '/api/images/main'
const a = '/api/images/a'
const b = '/api/images/b'
const n = '/api/images/new'

describe('picture changes never lose a picture', () => {
  it('makes a product’s first picture its main one', () => {
    expect(withAdded({ image: '', images: [] }, n, MAX)).toEqual({ image: n })
  })

  it('adds every later picture – a paste or a chosen file never replaces the main one', () => {
    expect(withAdded({ image: main, images: [a] }, n, MAX)).toEqual({ images: [a, n] })
  })

  it('adds the same picture only once', () => {
    expect(withAdded({ image: main, images: [a] }, a, MAX)).toEqual({})
    expect(withAdded({ image: main, images: [] }, main, MAX)).toEqual({})
  })

  it('says when there is no room instead of dropping the picture', () => {
    const full = { image: main, images: Array.from({ length: MAX }, (_, i) => `/api/images/${i}`) }
    expect(withAdded(full, n, MAX)).toBeNull()
  })

  it('keeps the former main picture when another one becomes the main one', () => {
    expect(withMain({ image: main, images: [a, b] }, b, MAX)).toEqual({ image: b, images: [main, a] })
    // A new picture from the shop page as main: the one there before stays.
    expect(withMain({ image: main, images: [a] }, n, MAX)).toEqual({ image: n, images: [main, a] })
    expect(withMain({ image: '', images: [] }, n, MAX)).toEqual({ image: n, images: [] })
  })

  it('refuses a new main picture when the former one would have no room', () => {
    const full = { image: main, images: Array.from({ length: MAX }, (_, i) => `/api/images/${i}`) }
    expect(withMain(full, n, MAX)).toBeNull()
    // Swapping within the pictures needs no room.
    expect(withMain(full, full.images[3], MAX)?.images).toHaveLength(MAX)
  })

  it('lets the next picture take the main place when the main one is removed', () => {
    expect(without({ image: main, images: [a, b] }, main)).toEqual({ image: a, images: [b] })
    expect(without({ image: main, images: [a, b] }, a)).toEqual({ image: main, images: [b] })
    expect(without({ image: main, images: [] }, main)).toEqual({ image: '', images: [] })
  })
})

describe('marked views follow their pictures', () => {
  const crop = { x: 0.1, y: 0, w: 0.8, h: 1 }

  it('marks a picture as a side; one picture may show several sides, each cut on its own', () => {
    expect(markView({}, a, 'front', crop)).toEqual({ front: { src: a, crop } })
    // A drawing with the front and the side: marking it as the side keeps the front.
    expect(markView({ front: { src: a, crop } }, a, 'side', null)).toEqual({ side: { src: a, crop: null } })
    // Another picture as the front replaces the mark, the old picture stays.
    expect(markView({ front: { src: a, crop: null } }, b, 'front', null)).toEqual({ front: { src: b, crop: null } })
    // None: all of the picture's marks go.
    expect(markView({ front: { src: a, crop: null }, side: { src: a, crop }, back: { src: b, crop } }, a, null, null)).toEqual({ front: null, side: null })
  })

  it('drops the marks of a picture that goes', () => {
    expect(viewsWithout({ front: { src: a, crop: null }, side: { src: b, crop: null } }, a)).toEqual({ front: null })
    expect(viewsWithout(undefined, a)).toEqual({})
  })

  it('moves marks with their pictures and loses those whose picture is gone', () => {
    const moved = remapViews({ front: { src: a, crop }, back: { src: b, crop: null } }, (src) => (src === a ? n : ''))
    expect(moved).toEqual({ front: { src: n, crop } })
    expect(viewsOf(moved, n)).toEqual(['front'])
    expect(viewsOf(moved, a)).toEqual([])
  })
})

describe('views on the server and in old records', () => {
  const pic = '/api/images/00000000-0000-4000-8000-000000000001'

  it('accepts a marked picture of this server with or without a crop, nothing else', () => {
    expect(checkFields('products', { views: { front: { src: pic, crop: null } } })).toBeNull()
    expect(checkFields('products', { views: { side: { src: pic, crop: { x: 0.2, y: 0, w: 0.5, h: 1 } } } })).toBeNull()
    expect(checkFields('products', { views: { top: { src: pic, crop: null } } })).toMatch(/views/)
    expect(checkFields('products', { views: { front: { src: 'https://shop.example/a.jpg', crop: null } } })).toMatch(/views/)
    expect(checkFields('products', { views: { front: { src: pic, crop: { x: 0.5, y: 0, w: 0.8, h: 1 } } } })).toMatch(/views/)
    expect(checkFields('products', { views: { front: { src: pic, crop: null, extra: 1 } } })).toMatch(/views/)
  })

  it('keeps on restore only marks of pictures the product has', () => {
    const other = '/api/images/00000000-0000-4000-8000-000000000002'
    const p = makeProduct('00000000-0000-4000-8000-000000000000', {
      image: pic,
      views: { front: { src: pic, crop: null }, side: { src: other, crop: null } },
    })
    expect(sanitize('products', p).views).toEqual({ front: { src: pic, crop: null } })
    // Records from before views existed stay as they are.
    const old = { ...p } as Partial<typeof p>
    delete old.views
    expect(sanitize('products', old as typeof p).views).toBeUndefined()
  })
})

describe('a dimension drawing on the server and in old records', () => {
  const pic = '/api/images/00000000-0000-4000-8000-000000000001'
  const crop = { x: 0.1, y: 0.1, w: 0.4, h: 0.8 }

  it('accepts a picture of this server with a front and a side view, each optional', () => {
    expect(checkFields('products', { drawing: { src: pic, front: crop, side: null } })).toBeNull()
    expect(checkFields('products', { drawing: null })).toBeNull()
    expect(checkFields('products', { drawing: { src: pic, front: crop } })).toMatch(/drawing/)
    expect(checkFields('products', { drawing: { src: 'https://shop.example/d.png', front: crop, side: null } })).toMatch(/drawing/)
    expect(checkFields('products', { drawing: { src: pic, front: { ...crop, w: 2 }, side: null } })).toMatch(/drawing/)
  })

  it('keeps on restore only a drawing the product still has', () => {
    const own = makeProduct('00000000-0000-4000-8000-000000000000', { image: pic, drawing: { src: pic, front: crop, side: null } })
    expect(sanitize('products', own).drawing).toEqual({ src: pic, front: crop, side: null })
    const foreign = makeProduct('00000000-0000-4000-8000-000000000000', { image: '', drawing: { src: pic, front: crop, side: null } })
    expect(sanitize('products', foreign).drawing).toBeNull()
  })
})

describe('corners of a photo taken from an angle', () => {
  const pic = '/api/images/00000000-0000-4000-8000-000000000001'
  const quad = [
    { x: 0.2, y: 0.1 },
    { x: 0.7, y: 0.2 },
    { x: 0.7, y: 0.8 },
    { x: 0.2, y: 0.9 },
  ]

  it('go with the mark, through moves, and are checked by the server', () => {
    expect(markView({}, pic, 'front', null, quad)).toEqual({ front: { src: pic, crop: null, quad } })
    expect(remapViews({ front: { src: pic, crop: null, quad } }, () => '/api/images/new')).toEqual({ front: { src: '/api/images/new', crop: null, quad } })
    expect(checkFields('products', { views: { front: { src: pic, crop: null, quad } } })).toBeNull()
    expect(checkFields('products', { views: { front: { src: pic, crop: null, quad: quad.slice(0, 3) } } })).toMatch(/views/)
    expect(checkFields('products', { views: { front: { src: pic, crop: null, quad: [...quad.slice(0, 3), { x: 2, y: 0 }] } } })).toMatch(/views/)
  })
})
