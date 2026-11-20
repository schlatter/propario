// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { addProduct, createProject, setVote, updateProduct } from '../src/db/repo'
import { makeProduct } from '../src/db/factories'
import { favoritePatch, isFavorite, statusOf, statusPatch, tally } from '../src/domain/verdict'
import { testServer } from './helpers/server'

describe('how a product stands', () => {
  it('reads a favourite from before 0.12 as checked with the star, and keeps the star when the status changes', () => {
    const old = makeProduct('p', { candidate: 'favorite' })
    expect(statusOf(old)).toBe('checked')
    expect(isFavorite(old)).toBe(true)
    expect(statusPatch(old, 'excluded')).toEqual({ candidate: 'excluded', favorite: true })
    expect(favoritePatch(old, 'ada', false)).toEqual({ favorites: { ada: false }, candidate: 'checked', favorite: true })
    expect(statusPatch(makeProduct('p'), 'checked')).toEqual({ candidate: 'checked' })
  })

  it('keeps stars personal; an old shared star counts for everyone until each chooses', () => {
    const shared = makeProduct('p', { favorite: true })
    expect(isFavorite(shared, 'ada')).toBe(true)
    expect(isFavorite(shared, 'grace')).toBe(true)
    const adaDropped = { ...shared, ...favoritePatch(shared, 'ada', false) }
    expect(isFavorite(adaDropped, 'ada')).toBe(false)
    expect(isFavorite(adaDropped, 'grace')).toBe(true)

    const plain = makeProduct('p')
    const graceStar = { ...plain, ...favoritePatch(plain, 'grace', true) }
    expect(isFavorite(graceStar, 'grace')).toBe(true)
    expect(isFavorite(graceStar, 'ada')).toBe(false)
    // Without a person (exports): anyone's star.
    expect(isFavorite(graceStar)).toBe(true)
    expect(isFavorite(plain)).toBe(false)
  })

  it('counts verdicts', () => {
    expect(tally(makeProduct('p', { votes: { a: 'like', b: 'neutral', c: 'like' } }))).toEqual({ like: 2, neutral: 1, dislike: 0 })
  })

  it('a verdict marks a product not looked at yet as checked; an excluded one stays excluded', async () => {
    const server = testServer()
    const ada = server.person('Ada', true)
    await ada.use()
    const project = await createProject({ name: 'Regal' })
    const a = await addProduct(project.id, { model: 'Arvika' })
    await setVote(a, ada.id, 'neutral')
    expect(await ada.cache.products.get(a.id)).toMatchObject({ candidate: 'checked', votes: { [ada.id]: 'neutral' } })

    const b = await addProduct(project.id, { model: 'Bo' })
    await updateProduct(b, { candidate: 'excluded' })
    await setVote((await ada.cache.products.get(b.id))!, ada.id, 'dislike')
    expect((await ada.cache.products.get(b.id))?.candidate).toBe('excluded')
  })
})
