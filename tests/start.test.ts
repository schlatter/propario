import { describe, expect, it } from 'vitest'
import { makeProduct, makeProject, makeProperty, makeRequirement } from '../src/db/factories'
import { linksIn } from '../src/domain/links'
import { ruleFromText, startNeeded, startSteps, untouched } from '../src/domain/start'

describe('links in a free text', () => {
  it('finds each link once, in order, without the punctuation after it', () => {
    const text =
      'Ours is too bulky: https://shop.example/tripod-big?id=1. Something like https://shop.example/mini, or https://www.shop.example/tripod-big?id=1&utm_source=x!'
    expect(linksIn(text)).toEqual(['https://shop.example/tripod-big?id=1', 'https://shop.example/mini'])
  })

  it('takes the link itself out of Markdown, also with escaped ampersands, once', () => {
    const md = '[https://shop.example/p?a=1&b=2](https://shop.example/p?a=1\\&b=2) and [https://shop.example/q](https://shop.example/q)'
    expect(linksIn(md)).toEqual(['https://shop.example/p?a=1&b=2', 'https://shop.example/q'])
  })

  it('finds nothing in a text without links', () => {
    expect(linksIn('A light tripod, www without scheme is no link')).toEqual([])
  })
})

describe('the steps of the start', () => {
  const project = makeProject({ id: 'c', description: '' })

  it('are all open in a new comparison, and the card is needed', () => {
    const s = startSteps(project, [], [])
    expect(s).toEqual({ goal: false, budget: false, criteria: false, product: false })
    expect(startNeeded(s)).toBe(true)
  })

  it('count a budget or a requirement as a criterion', () => {
    expect(startSteps({ ...project, budget: 80 }, [], []).criteria).toBe(true)
    expect(startSteps(project, [], [makeRequirement('c')]).criteria).toBe(true)
  })

  it('are no longer needed once a candidate and a criterion are there, even without a goal', () => {
    const s = startSteps({ ...project, budget: 80 }, [makeProduct('c')], [])
    expect(s.goal).toBe(false)
    expect(startNeeded(s)).toBe(false)
  })
})

describe('a requirement with a limit', () => {
  it('names the number field and the rule it checks', () => {
    expect(ruleFromText('Breite max. 60 cm')).toEqual({ name: 'Breite', unit: 'cm', op: 'lte', value: 60 })
    expect(ruleFromText('Traglast mindestens 2 kg')).toEqual({ name: 'Traglast', unit: 'kg', op: 'gte', value: 2 })
  })

  it('takes the unit of the chosen suggestion when none is typed', () => {
    expect(ruleFromText('Width at most 60', 'cm')).toEqual({ name: 'Width', unit: 'cm', op: 'lte', value: 60 })
    expect(ruleFromText('Weight at most 2 lb', 'kg')?.unit).toBe('')
  })

  it('stays a requirement checked by hand without a limit and a number', () => {
    expect(ruleFromText('Fits into the day bag')).toBeNull()
    expect(ruleFromText('Width at most')).toBeNull()
  })
})

describe('a new comparison left as it was', () => {
  const fresh = makeProject({ id: 'c', name: 'New comparison', description: '' })

  it('is untouched with its first name and nothing in it', () => {
    expect(untouched(fresh, 'New comparison', [], [], [])).toBe(true)
  })

  it('is kept once anything was written, added or set', () => {
    expect(untouched({ ...fresh, name: 'Travel tripod' }, 'New comparison', [], [], [])).toBe(false)
    expect(untouched({ ...fresh, description: 'Light' }, 'New comparison', [], [], [])).toBe(false)
    expect(untouched({ ...fresh, category: 'Photo' }, 'New comparison', [], [], [])).toBe(false)
    expect(untouched({ ...fresh, budget: 0 }, 'New comparison', [], [], [])).toBe(false)
    expect(untouched(fresh, 'New comparison', [makeProduct('c')], [], [])).toBe(false)
    expect(untouched(fresh, 'New comparison', [], [makeRequirement('c')], [])).toBe(false)
    expect(untouched(fresh, 'New comparison', [], [], [makeProperty('c')])).toBe(false)
  })
})
