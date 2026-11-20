// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDatabase } from './db.ts'

const dir = mkdtempSync(join(tmpdir(), 'propario-backup-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const run = (...args: string[]) =>
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(__dirname, 'backup.ts'), ...args], {
    env: { ...process.env, DATA_DIR: dir, DATA_KEY: '' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

describe('server snapshots', () => {
  it('keeps the newest 7 rollout snapshots; the nightly copy for the server backup is left alone', () => {
    openDatabase(join(dir, 'propario.db')).close()
    const folder = join(dir, 'backups')
    mkdirSync(folder)
    for (let i = 0; i < 9; i++) writeFileSync(join(folder, `propario-2026-01-0${i + 1}T00-00-00-000Z.db`), '')
    writeFileSync(join(folder, 'nightly.db'), 'last night')

    run()
    const left = readdirSync(folder).sort()
    expect(left.filter((f) => f.startsWith('propario-'))).toHaveLength(7)
    expect(left).not.toContain('propario-2026-01-01T00-00-00-000Z.db')
    expect(left).toContain('nightly.db')

    // An explicit target (the nightly run) writes there and prunes nothing.
    run(join(folder, 'nightly.tmp.db'))
    expect(readdirSync(folder).filter((f) => f.startsWith('propario-'))).toHaveLength(7)
    expect(readdirSync(folder)).toContain('nightly.tmp.db')
  })
})
