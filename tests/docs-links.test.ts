// @vitest-environment node
/**
 * Every relative link and picture in the documentation and on the website points to a file that
 * exists – so a renamed file or screenshot cannot leave the docs pointing at nothing.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')
const markdown = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'GLOSSARY.md',
  ...readdirSync(join(root, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`),
]

/** Targets of Markdown links/images and of src, srcset and href attributes. */
function targets(text: string): string[] {
  const found = [...text.matchAll(/\]\(([^)\s]+)\)/g), ...text.matchAll(/\b(?:src|srcset|href)="([^"]+)"/g)].map((m) => m[1])
  return found.filter((t) => !/^(https?:|mailto:|#|data:)/.test(t)).map((t) => t.split('#')[0])
}

it.each(markdown)('%s links only to files that exist', (file) => {
  const missing = targets(readFileSync(join(root, file), 'utf8')).filter((t) => !existsSync(join(root, dirname(file), t)))
  expect(missing).toEqual([])
})

it('the website refers only to files the build puts next to it', () => {
  // scripts/build-site.sh: site/* at the root, docs/images → images/, the logo, fonts/.
  const source = (t: string) =>
    t.startsWith('images/')
      ? join(root, 'docs', t)
      : t.startsWith('fonts/')
        ? null
        : t === 'favicon.svg'
          ? join(root, 'public', t)
          : join(root, 'site', normalize(t))
  const html = readFileSync(join(root, 'site', 'index.html'), 'utf8')
  const missing = targets(html)
    .filter((t) => t && t !== './')
    .filter((t) => {
      const s = source(t)
      return s !== null && !existsSync(s)
    })
  expect(missing).toEqual([])
  const css = readFileSync(join(root, 'site', 'site.css'), 'utf8')
  expect(
    [...css.matchAll(/url\('fonts\/([^']+)'\)/g)].map((m) => m[1]).every((f) => readFileSync(join(root, 'scripts', 'build-site.sh'), 'utf8').includes(f)),
  ).toBe(true)
})
