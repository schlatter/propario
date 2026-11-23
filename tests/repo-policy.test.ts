// @vitest-environment node
/**
 * scripts/check-repo-policy.sh guards what may leave this machine. Each rule is proved with a
 * case it must let through and one it must refuse, in a throwaway repository.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = join(import.meta.dirname, '..', 'scripts', 'check-repo-policy.sh')
const ada = 'Ada <1+ada@users.noreply.github.com>'
let repo: string

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
}

function commit(file: string, content: string, message = 'Change', author = ada) {
  writeFileSync(join(repo, file), content)
  git('add', file)
  const [name, email] = author.replace('>', '').split(' <')
  execFileSync('git', ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', message], { cwd: repo })
}

function policy(...args: string[]) {
  const run = spawnSync('bash', ['scripts/check-repo-policy.sh', ...args], { cwd: repo, encoding: 'utf8' })
  return { ok: run.status === 0, status: run.status, stderr: run.stderr }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'propario-policy-'))
  git('init', '-q', '-b', 'main')
  mkdirSync(join(repo, 'scripts'))
  mkdirSync(join(repo, 'private'))
  copyFileSync(script, join(repo, 'scripts', 'check-repo-policy.sh'))
  writeFileSync(join(repo, '.gitignore'), '/private\n')
  writeFileSync(join(repo, 'private', 'denylist.txt'), '# people\nQuill\nTeststr.\n')
  commit('.gitignore', '/private\n', 'Start')
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('staged changes (pre-commit)', () => {
  function stage(file: string, content: string) {
    writeFileSync(join(repo, file), content)
    git('add', '-f', file)
  }

  it('matches denylisted terms as whole words, ignoring case', () => {
    stage('notes.md', 'A quilted cover and quillwork.\n')
    expect(policy().ok).toBe(true)
    stage('notes.md', 'Bought by quill.\n')
    const run = policy()
    expect(run.ok).toBe(false)
    expect(run.stderr).toContain('notes.md')
    expect(run.stderr).not.toMatch(/quill\b/i) // the term itself is never printed
  })

  it('refuses private paths and databases', () => {
    stage('data.sqlite', 'x')
    expect(policy().ok).toBe(false)
  })
})

describe('outgoing commits (pre-push)', () => {
  it('lets clean commits with noreply addresses through', () => {
    commit('a.md', 'Fine.\n')
    expect(policy('--outgoing')).toMatchObject({ ok: true, stderr: '' })
  })

  it('refuses a term in a commit message, which pre-commit cannot see', () => {
    commit('a.md', 'Fine.\n', 'Ideas from Quill')
    expect(policy('--outgoing').stderr).toContain('in its message')
  })

  it('refuses a term added in any outgoing commit, even if removed later', () => {
    commit('a.md', 'Near the Teststr. 5\n')
    commit('a.md', 'Gone.\n')
    expect(policy('--outgoing').stderr).toContain('adds terms')
  })

  it('refuses a private address as author or tagger', () => {
    commit('a.md', 'Fine.\n', 'Change', 'Ada <ada@example.org>')
    expect(policy('--outgoing').stderr).toContain('author address')
  })

  it('checks annotated tags', () => {
    commit('a.md', 'Fine.\n')
    execFileSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.org', 'tag', '-a', 'v1', '-m', 'v1 for Quill'], { cwd: repo })
    const run = policy('--outgoing')
    expect(run.stderr).toContain('tag v1: tagger address')
    expect(run.stderr).toContain('tag v1 has a term')
  })

  it('ignores commits a remote already has', () => {
    commit('a.md', 'Fine.\n', 'Old message for Quill')
    const remote = mkdtempSync(join(tmpdir(), 'propario-remote-'))
    try {
      execFileSync('git', ['init', '-q', '--bare', remote])
      git('remote', 'add', 'origin', remote)
      git('push', '-q', 'origin', 'main')
      expect(policy('--outgoing').ok).toBe(true)
    } finally {
      rmSync(remote, { recursive: true, force: true })
    }
  })

  it('fails closed on an unreadable denylist', () => {
    commit('a.md', 'Fine.\n')
    rmSync(join(repo, 'private', 'denylist.txt'))
    mkdirSync(join(repo, 'private', 'denylist.txt'))
    expect(policy('--outgoing').ok).toBe(false)
  })
})
