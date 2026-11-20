import { describe, expect, it } from 'vitest'
import { withAdded, withMain, without } from '../src/domain/pictures'

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
