// @vitest-environment node
/**
 * scripts/release-tag.sh starts from the current main by itself, and never from changes that
 * are not on origin. Answered "n", it publishes nothing.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// As in release-notes.test.ts: a git hook's GIT_* variables would point git at the real repository.
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) delete process.env[name]

let dir: string
let work: string
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.org', ...args], { cwd, encoding: 'utf8' }).trim()

function release() {
  const run = spawnSync('bash', ['scripts/release-tag.sh'], { cwd: work, input: 'n\n', encoding: 'utf8' })
  return { status: run.status, stderr: run.stderr }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'propario-release-tag-'))
  const origin = join(dir, 'origin.git')
  const upstream = join(dir, 'upstream')
  work = join(dir, 'work')
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin)
  git(dir, 'clone', '-q', origin, upstream)
  mkdirSync(join(upstream, 'scripts'))
  for (const s of ['release-tag.sh', 'release-notes.sh']) copyFileSync(join(import.meta.dirname, '..', 'scripts', s), join(upstream, 'scripts', s))
  writeFileSync(join(upstream, 'package.json'), JSON.stringify({ version: '0.18.0' }))
  writeFileSync(join(upstream, 'CHANGELOG.md'), '# Changelog\n\n## 0.18.0 — 2026-12-20\n\n- Added: duels for three.\n')
  git(upstream, 'add', '.')
  git(upstream, 'commit', '-q', '-m', 'start')
  git(upstream, 'push', '-q', 'origin', 'main')
  git(dir, 'clone', '-q', origin, work)
  git(work, 'switch', '-q', '-c', 'feature')
  // The pull request is merged on GitHub: origin/main moves on while this clone sits on its branch.
  writeFileSync(join(upstream, 'notes.txt'), 'merged\n')
  git(upstream, 'add', '.')
  git(upstream, 'commit', '-q', '-m', 'merged pull request')
  git(upstream, 'push', '-q', 'origin', 'main')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('release-tag', () => {
  it('switches to main and brings it up to origin/main before it asks', () => {
    expect(release()).toMatchObject({ status: 1, stderr: expect.stringContaining('nothing published') })
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(git(work, 'rev-parse', 'HEAD')).toBe(git(work, 'rev-parse', 'origin/main'))
    expect(git(work, 'tag')).toBe('')
  })

  it('leaves uncommitted changes and their branch alone', () => {
    writeFileSync(join(work, 'draft.txt'), 'not committed\n')
    expect(release()).toMatchObject({ status: 1, stderr: expect.stringContaining('uncommitted changes') })
    expect(git(work, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feature')
  })

  it('refuses a main with commits that origin/main lacks', () => {
    git(work, 'switch', '-q', 'main')
    writeFileSync(join(work, 'local.txt'), 'only here\n')
    git(work, 'add', '.')
    git(work, 'commit', '-q', '-m', 'local only')
    expect(release()).toMatchObject({ status: 1, stderr: expect.stringContaining('not on origin/main') })
    expect(git(work, 'tag')).toBe('')
  })
})
