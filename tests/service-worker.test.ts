// @vitest-environment node
/**
 * The service worker may keep only the app's own versioned files: never pages, API answers or
 * pictures (personal data must not linger in a cache, and pages must always come fresh).
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(__dirname, '../src/service-worker.js'), 'utf8')
const context = vm.createContext({ self: { addEventListener: () => {}, location: { origin: 'https://p.example' } }, URL, setTimeout, Promise })
vm.runInContext(source, context)
const strategyFor = context.strategyFor as (url: URL, mode: string, origin: string) => string
const at = (p: string, mode = 'cors', origin = 'https://p.example') => strategyFor(new URL(p, 'https://p.example'), mode, origin)

describe('service worker', () => {
  it('caches only versioned build files, and gives pages an offline fallback', () => {
    expect(at('/assets/index-DMGUYi5E.js')).toBe('asset')
    expect(at('/p/123', 'navigate')).toBe('page')
    expect(at('/api/sync')).toBe('network')
    expect(at('/api/images/0a1b2c3d-0000-4000-8000-000000000000')).toBe('network')
    expect(at('/version.json')).toBe('network')
    expect(strategyFor(new URL('https://cdn.example/assets/x.js'), 'cors', 'https://p.example')).toBe('network')
  })

  it('never waits for a cache that does not answer, and never delays the answer to store a copy', async () => {
    const fromCacheOrNetwork = context.fromCacheOrNetwork as (
      request: string,
      store: { match: (r: string) => Promise<unknown>; put: (r: string, res: unknown) => Promise<void> },
      network: (r: string) => Promise<{ ok: boolean; clone: () => unknown }>,
      later: (p: Promise<unknown>) => void,
      wait: number,
    ) => Promise<unknown>
    const fresh = { ok: true, clone: () => 'copy' }
    const stored: unknown[] = []
    const hanging = { match: () => new Promise(() => {}), put: () => new Promise<void>(() => {}) }
    const later = (p: Promise<unknown>) => void stored.push(p)
    // The storage hangs: the file still comes, from the network, and storing it is left for later.
    expect(await fromCacheOrNetwork('/assets/a.js', hanging, async () => fresh, later, 10)).toBe(fresh)
    expect(stored).toHaveLength(1)
    // A cached copy is used as it is.
    const cached = { match: async () => 'cached', put: async () => {} }
    expect(await fromCacheOrNetwork('/assets/a.js', cached, async () => fresh, later, 10)).toBe('cached')
  })

  it('names its cache after the build, so a new release clears the old files', () => {
    expect(source).toContain("const CACHE = 'propario-__VERSION__'")
    expect(fs.readFileSync(path.resolve(__dirname, '../vite.config.ts'), 'utf8')).toContain("replaceAll('__VERSION__', version)")
  })
})
