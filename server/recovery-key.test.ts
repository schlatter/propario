// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDatabase } from './db.ts'
import { createUser, useRecoveryKey } from './users.ts'

const dir = mkdtempSync(join(tmpdir(), 'propario-recovery-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const run = (name: string) =>
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(__dirname, 'recovery-key.ts'), name], {
    env: { ...process.env, DATA_DIR: dir, DATA_KEY: '' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

describe('operator recovery key', () => {
  it('issues a new key for an account by name; the old key stops working', () => {
    const db = openDatabase(join(dir, 'propario.db'))
    const { recoveryKey: old } = createUser(db, { id: '00000000-0000-4000-8000-0000000000a1', name: 'Ada', isAdmin: true })
    db.close()

    const out = run('ada')
    const fresh = out.match(/^\s{2}(\S+)\s*$/m)?.[1]
    expect(fresh).toBeTruthy()

    const again = openDatabase(join(dir, 'propario.db'))
    expect(useRecoveryKey(again, old)).toBeNull()
    expect(useRecoveryKey(again, fresh!)?.userId).toBe('00000000-0000-4000-8000-0000000000a1')
    again.close()
  })

  it('refuses unknown names and lists the accounts', () => {
    expect(() => run('Grace')).toThrow(/Accounts: "Ada"/)
  })

  it('never prints control characters of a stored name to the terminal', () => {
    // Stored before names were checked: an escape sequence that would write the clipboard.
    const db = openDatabase(join(dir, 'propario.db'))
    createUser(db, { id: '00000000-0000-4000-8000-0000000000b2', name: 'Eve\u001b]52;c;ZWNobyBoaQ==\u0007\u009b2J', isAdmin: false })
    db.close()
    let stderr = ''
    try {
      run('nobody')
    } catch (e) {
      stderr = String((e as { stderr: string }).stderr)
    }
    expect(stderr).toContain('Eve')
    expect(stderr).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/) // line breaks of the message itself aside
  })
})
