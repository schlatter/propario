import { describe, expect, it } from 'vitest'
import { factsFromUrl } from '../src/domain/url-facts'

describe('what a shop link says by itself', () => {
  it('reads name and dimensions from an address like Otto’s, without the article number', () => {
    const url =
      'https://www.moebel.example/p/nordhaus-sideboard-mit-led-beleuchtung-schubladen-und-glastueren-in-landhaus-stil-1-st-b140-t42-h85-cm-anrichte-kommode-wohnzimmer-mit-verstellbaren-ablagen-AB12CD34/?variationId=AB12CD34EF#top'
    expect(factsFromUrl(url)).toEqual({
      name: 'Nordhaus Sideboard mit Led Beleuchtung Schubladen und Glastueren in Landhaus Stil',
      specs: [
        { name: 'Breite', value: '140 cm' },
        { name: 'Tiefe', value: '40 cm' },
        { name: 'Höhe', value: '85 cm' },
      ],
    })
  })

  it('takes a plain product slug and gives nothing for addresses without one', () => {
    expect(factsFromUrl('https://shop.example/moebel/regal-kenwick-26271-5-1.html').name).toBe('Regal Kenwick')
    expect(factsFromUrl('https://shop.example/p/123456')).toEqual({})
    expect(factsFromUrl('not a url')).toEqual({})
  })
})
