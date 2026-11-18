import { describe, expect, it } from 'vitest'
import { makeProduct, makeProperty } from '../src/db/factories'
import type { Product } from '../src/db/types'
import { compileQuery } from '../src/domain/query'
import { queryFields } from '../src/domain/query-fields'

const width = makeProperty('p', { name: 'Breite (cm)', type: 'number', unit: 'cm' })
const color = makeProperty('p', { name: 'Farbe', type: 'text' })
const open = makeProperty('p', { name: 'Offene Mitte', type: 'boolean' })
const fields = queryFields([width, color, open], () => ({ pass: 0, fail: 0, unknown: 0, blocked: false, qualified: true, fit: 80, fitOpen: 0 }), 'Ada')

const products = [
  makeProduct('p', { model: 'Arvika', price: 499, foundBy: 'Ada', values: { [width.id]: 90, [color.id]: 'Weiß', [open.id]: true } }),
  makeProduct('p', { model: 'Bo', price: 1200, candidate: 'favorite', values: { [width.id]: 120, [color.id]: 'Grün', [open.id]: false } }),
  makeProduct('p', { model: 'Cleo', candidate: 'excluded', values: { [width.id]: 80 } }),
]
const run = (q: string) => {
  const c = compileQuery<Product>(q, fields)
  if (!c.ok) throw new Error(`${c.error.code} at ${c.error.at}: ${c.error.text}`)
  return products.filter(c.test).map((p) => p.model)
}

describe('advanced filter', () => {
  it('compares numbers, text and yes/no, own fields by name with or without unit', () => {
    expect(run('Breite <= 90')).toEqual(['Arvika', 'Cleo'])
    expect(run('"Breite (cm)" > 100')).toEqual(['Bo'])
    expect(run('Farbe = weiß')).toEqual(['Arvika'])
    expect(run('Farbe ~ ü')).toEqual(['Bo'])
    expect(run('"Offene Mitte" = ja')).toEqual(['Arvika'])
  })

  it('combines with AND, OR, NOT and parentheses, in German or English; AND binds tighter', () => {
    expect(run('Breite < 100 AND (Farbe ~ weiß OR Farbe ~ grün)')).toEqual(['Arvika'])
    expect(run('Preis > 1000 ODER Breite < 85 UND NICHT Auswahl = ausgeschlossen')).toEqual(['Bo'])
    expect(run('NOT Auswahl = excluded Breite >= 90')).toEqual(['Arvika', 'Bo'])
  })

  it('knows built-in fields and their words: selection, finder, numbers in German notation', () => {
    expect(run('Auswahl = Favorit')).toEqual(['Bo'])
    expect(run('Mein = ja')).toEqual(['Arvika'])
    expect(run('Gefunden von = ada')).toEqual(['Arvika'])
    expect(run('Preis >= 1.200')).toEqual(['Bo'])
    expect(run('Eignung >= 80')).toHaveLength(3)
  })

  it('treats missing values as in JQL: only IS EMPTY matches them', () => {
    expect(run('Farbe IST LEER')).toEqual(['Cleo'])
    expect(run('Farbe IS NOT EMPTY')).toEqual(['Arvika', 'Bo'])
    expect(run('Preis < 10000')).toEqual(['Arvika', 'Bo'])
    expect(run('Farbe != Weiß')).toEqual(['Bo'])
  })

  it('reports mistakes with their place instead of guessing', () => {
    const err = (q: string) => {
      const c = compileQuery<Product>(q, fields)
      return c.ok ? null : c.error
    }
    expect(err('Tiefe < 40')).toMatchObject({ code: 'unknown-field', at: 0, text: 'Tiefe' })
    expect(err('Breite < viel')).toMatchObject({ code: 'bad-value', text: 'viel' })
    expect(err('(Breite < 90')).toMatchObject({ code: 'unclosed' })
    expect(err('Breite <')).toMatchObject({ code: 'end' })
    expect(err('Farbe = "weiß')).toMatchObject({ code: 'unclosed', at: 8 })
    expect(err('x'.repeat(501))).toMatchObject({ code: 'too-long' })
    expect(compileQuery('  ', fields).ok).toBe(true)
  })
})
