// @vitest-environment node
/**
 * One story everywhere: the README, the website and the README's diagram say what the app's
 * start page says (src/i18n/en.ts, `overview`) – word for word, so they cannot contradict it.
 * Change a text there, and this test names every place to change with it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/en'

const root = join(import.meta.dirname, '..')
/** Visible words only: tags out, entities decoded, whitespace as single spaces. */
const words = (file: string) =>
  readFileSync(join(root, file), 'utf8')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const o = en.overview
const titles = [o.s1Title, o.s2Title, o.s3Title, o.s4Title, o.s5Title, o.s6Title]
const story = [o.lead, ...titles, o.s1Text, o.s2Text, o.s3Text, o.s4Text, o.s5Text, o.s6Text, o.aiTitle, o.aiText, o.trustTitle.replace(/\.$/, ''), ...o.trust]

describe.each(['README.md', 'site/index.html'])('%s', (file) => {
  it('tells the start page’s story in its words', () => {
    const text = words(file)
    expect(story.filter((s) => !text.includes(s))).toEqual([])
  })
})

it('the diagram names the six steps in order', () => {
  const text = words('docs/images/how-it-works.svg')
  const at = titles.map((t) => text.lastIndexOf(t))
  expect(at.every((i) => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
})
