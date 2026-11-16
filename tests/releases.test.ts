import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOCALES } from '../src/i18n'
import { RELEASES } from '../src/releases'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const changelog = readFileSync('CHANGELOG.md', 'utf8')
const semver = (v: string) => v.split('.').map(Number)

describe('releases', () => {
  it('have at most four short lines, in every language', () => {
    for (const r of RELEASES) {
      for (const locale of Object.keys(LOCALES)) {
        const notes = r.notes[locale as keyof typeof r.notes]
        expect(notes.length, `${r.version} ${locale}`).toBeGreaterThan(0)
        expect(notes.length, `${r.version} ${locale}`).toBeLessThanOrEqual(4)
        for (const line of notes) expect(line.length, line).toBeLessThanOrEqual(110)
      }
    }
  })

  it('are listed newest first and never ahead of package.json', () => {
    const order = (a: string, b: string) => {
      const [x, y] = [semver(a), semver(b)]
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
    }
    for (let i = 1; i < RELEASES.length; i++) expect(order(RELEASES[i - 1].version, RELEASES[i].version)).toBeGreaterThan(0)
    expect(order(RELEASES[0].version, pkg.version)).toBeLessThanOrEqual(0)
  })

  it('every release in package.json has a changelog entry', () => {
    expect(changelog).toMatch(new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}$`, 'm'))
    expect(changelog).toMatch(/^## Unreleased$/m)
  })
})
