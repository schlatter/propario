import { describe, expect, it } from 'vitest'
import { coerceValue, parseBoolean, parseDate, parseNumber, safeHref } from '../src/domain/values'

describe('parseNumber', () => {
  it.each([
    ['424 €', 424],
    ['1,500 €', 1500],
    ['13,850.00 €', 13850],
    ['1.234,50 €', 1234.5],
    ['0,35', 0.35],
    ['12.5 kg', 12.5],
    ['38g', 38],
    ['90kW', 90],
    [' 63 ', 63],
    [42, 42],
  ])('%s → %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected)
  })

  it.each(['830 – 900 €', '2x9g', '8l/100km', '1.072 x 1.448', 'abc', ''])('rejects %s', (input) => {
    expect(parseNumber(input)).toBeNull()
  })
})

describe('parseDate', () => {
  it('reads German, ISO and Excel serial dates', () => {
    expect(parseDate('09.11.2022')).toBe('2022-11-09')
    expect(parseDate('2024-07-29')).toBe('2024-07-29')
    expect(parseDate('29/07/2024')).toBe('2024-07-29')
    expect(parseDate(42044)).toBe('2015-02-09')
    expect(parseDate('August 2018')).toBeNull()
  })
})

describe('parseBoolean / coerceValue', () => {
  it('reads ja/nein', () => {
    expect(parseBoolean('Ja')).toBe(true)
    expect(parseBoolean('nein')).toBe(false)
    expect(parseBoolean('SmartFrost')).toBeNull()
  })
  it('keeps text that does not fit the type', () => {
    expect(coerceValue('number', '460 (550)')).toEqual({ ok: false, value: '460 (550)' })
    expect(coerceValue('number', '12,5')).toEqual({ ok: true, value: 12.5 })
    expect(coerceValue('boolean', 'Ja')).toEqual({ ok: true, value: true })
  })
})

describe('safeHref', () => {
  it('only allows http(s)', () => {
    expect(safeHref('www.example.org/x')).toBe('https://www.example.org/x')
    expect(safeHref('javascript:alert(1)')).toBeNull()
  })
})
