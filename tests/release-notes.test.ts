// @vitest-environment node
/**
 * scripts/release-notes.sh decides what a release says and refuses one whose tag, package.json
 * and CHANGELOG.md disagree – before the workflow publishes anything.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// A git hook (pre-push runs these tests) exports GIT_DIR, GIT_INDEX_FILE and the like. Inherited,
// they point every git call here – and in the scripts under test – at the real repository instead
// of the throwaway one: in a worktree that rewrote its index and made it bare. Never inherit them.
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) delete process.env[name]

const changelog = `# Changelog

## Unreleased

- Added: something not released yet.

## 0.18.0 — 2026-12-20

- Added: duels for three.
- Fixed: a picture could stay black.
## 0.17.3 — 2026-11-22

- Changed: the room view.
`
let repo: string

function notes(tag: string, version = '0.18.0') {
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ version }))
  const run = spawnSync('bash', ['scripts/release-notes.sh', tag], { cwd: repo, encoding: 'utf8' })
  return { ok: run.status === 0, stdout: run.stdout, stderr: run.stderr }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'propario-release-'))
  execFileSync('git', ['init', '-q'], { cwd: repo })
  mkdirSync(join(repo, 'scripts'))
  copyFileSync(join(import.meta.dirname, '..', 'scripts', 'release-notes.sh'), join(repo, 'scripts', 'release-notes.sh'))
  writeFileSync(join(repo, 'CHANGELOG.md'), changelog)
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('release notes', () => {
  it('prints exactly the dated entry of the tagged version', () => {
    expect(notes('v0.18.0')).toMatchObject({ ok: true, stdout: '- Added: duels for three.\n- Fixed: a picture could stay black.\n' })
    expect(notes('v0.17.3', '0.17.3').stdout).toBe('- Changed: the room view.\n')
  })

  it('refuses a version that package.json does not carry', () => {
    expect(notes('v0.18.0', '0.17.3')).toMatchObject({ ok: false, stderr: expect.stringContaining('package.json says 0.17.3') })
  })

  it('refuses a version without a dated CHANGELOG entry', () => {
    expect(notes('v0.19.0', '0.19.0')).toMatchObject({ ok: false, stderr: expect.stringContaining('no dated entry') })
    writeFileSync(join(repo, 'CHANGELOG.md'), changelog.replace('0.18.0 — 2026-12-20', '0.18.0'))
    expect(notes('v0.18.0').ok).toBe(false)
  })

  it('refuses tags that are not plain versions', () => {
    for (const tag of ['0.18.0', 'v0.18', 'v0.18.0-rc.1', 'latest']) expect(notes(tag).ok, tag).toBe(false)
  })
})
