import { describe, expect, it } from 'vitest'
import { cardFacts } from '../src/domain/display'

const f = (name: string, text: string) => ({ name, text })

describe('the swipe card’s facts', () => {
  it('takes the first four values that fit one line, in the fields’ order', () => {
    const facts = cardFacts([
      f('Colour', 'Light olive / natural'),
      f('Body', 'Solid pine, lacquered'),
      f('Other materials', 'Vienna straw made of paper; iron knobs'),
      f('Empty', ''),
      f('Weight', '42.5 kg'),
      f('Glass doors', '2'),
    ])
    expect(facts.map((x) => x.name)).toEqual(['Colour', 'Body', 'Weight', 'Glass doors'])
  })

  it('lets longer values fill in when there are not enough short ones, still in order', () => {
    const facts = cardFacts([f('Notes', 'A very long remark that needs two lines'), f('Weight', '40 kg'), f('Colour', 'Green')])
    expect(facts.map((x) => x.name)).toEqual(['Notes', 'Weight', 'Colour'])
  })
})
