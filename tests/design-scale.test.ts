// @vitest-environment node
/**
 * Spacing and type follow the scales in docs/brand.md, so a new screen looks like the others
 * without deciding every gap again. The scales are read from that page.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const brand = readFileSync('docs/brand.md', 'utf8')
const scale = (name: string) => {
  const line = brand.match(new RegExp(`\\*\\*${name} scale \\(px\\): ([\\d, ]+)\\.\\*\\*`))
  if (!line) throw new Error(`docs/brand.md names no ${name} scale`)
  return new Set(line[1].split(',').map((n) => Number(n.trim())))
}
const SPACE = scale('Spacing')
const TYPE = scale('Type')

const SPACING_CSS = /^(gap|row-gap|column-gap|padding(-[a-z-]+)?|margin(-[a-z-]+)?)$/
const SPACING_JSX = /^(gap|rowGap|columnGap|padding[A-Za-z]*|margin[A-Za-z]*)$/

function offScale(prop: string, value: string): string[] {
  const isType = prop === 'font-size' || prop === 'fontSize'
  if (isType && value.includes('clamp(')) return []
  const allowed = isType ? TYPE : SPACE
  return [...value.matchAll(/(\d+(?:\.\d+)?)px/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n !== 0 && !allowed.has(n))
    .map(String)
}

function files(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : [],
  )
}

describe('design scales', () => {
  it('the CSS uses only spacing and type steps from docs/brand.md', () => {
    const wrong: string[] = []
    for (const file of files('src', '.css')) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of css.matchAll(/(?<![\w-])([a-z-]+)\s*:\s*([^;{}]+)/g)) {
        const [prop, value] = [m[1], m[2]]
        if (prop !== 'font-size' && !SPACING_CSS.test(prop)) continue
        if (prop.startsWith('--')) continue
        for (const n of offScale(prop, value)) wrong.push(`${file}: ${prop}: ${value.trim()} (${n})`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('inline styles use them too', () => {
    const wrong: string[] = []
    for (const file of files('src', '.tsx')) {
      const code = readFileSync(file, 'utf8')
      for (const m of code.matchAll(/style=\{\{([^}]*)\}\}/g))
        for (const d of m[1].matchAll(/(\w+):\s*(-?\d+(?:\.\d+)?)\b/g)) {
          const [prop, value] = [d[1], d[2]]
          if (prop !== 'fontSize' && !SPACING_JSX.test(prop)) continue
          const n = Math.abs(Number(value))
          if (n !== 0 && !(prop === 'fontSize' ? TYPE : SPACE).has(n)) wrong.push(`${file}: ${prop}: ${value}`)
        }
    }
    expect(wrong).toEqual([])
  })
})
