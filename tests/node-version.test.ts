// @vitest-environment node
/**
 * One Node.js version everywhere: `.nvmrc` sets it (CI reads it), the Dockerfile and `engines`
 * follow. Dependabot raises only the Dockerfile – this test makes such a pull request fail until
 * the rest is raised with it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const read = (file: string) => readFileSync(join(import.meta.dirname, '..', file), 'utf8')

it('uses the major version from .nvmrc in the Dockerfile and in engines', () => {
  const major = read('.nvmrc').trim()
  expect(major).toMatch(/^\d+$/)
  const images = [...read('Dockerfile').matchAll(/^FROM node:(\d+)/gm)].map((m) => m[1])
  expect(images.length).toBeGreaterThan(0)
  expect(
    images.every((v) => v === major),
    `Dockerfile uses node:${images.join(', ')}`,
  ).toBe(true)
  expect((JSON.parse(read('package.json')) as { engines: { node: string } }).engines.node).toBe(`>=${major}`)
})
