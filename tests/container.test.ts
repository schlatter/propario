// @vitest-environment node
/**
 * The runtime image copies only some source folders (see Dockerfile). Every file the server
 * imports must be among them, or the container does not start – a rollout fails although all
 * other tests pass. This follows the server's imports and checks them against the Dockerfile.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')

/** Paths the runtime stage copies from the build context (`COPY <src...> <dest>` without --from). */
function copiedPaths(): string[] {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')
  const runtime = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '))
  return runtime
    .split('\n')
    .filter((l) => /^COPY\s/.test(l) && !l.includes('--from'))
    .flatMap((l) => l.trim().split(/\s+/).slice(1, -1))
}

/** Files reachable from the entry point through value imports (type-only imports are erased). */
function serverFiles(entry: string): Set<string> {
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    const src = fs.readFileSync(file, 'utf8')
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
      if (m[1]) continue
      visit(path.resolve(path.dirname(file), m[2]))
    }
  }
  visit(path.join(root, entry))
  return seen
}

describe('container image', () => {
  it('contains every file the server imports', () => {
    const copied = copiedPaths().map((p) => path.join(root, p))
    const missing = [...serverFiles('server/main.ts')]
      .filter((f) => !copied.some((c) => f === c || f.startsWith(c + path.sep)))
      .map((f) => path.relative(root, f))
    expect(missing).toEqual([])
  })
})
