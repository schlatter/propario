// @vitest-environment node
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './db.ts'
import { parseKey, useKey } from './crypto.ts'
import { devDataKey, loadConfig } from './env.ts'
import { applyChanges, keyProblem } from './store.ts'
import { createUser } from './users.ts'
import { makeProject } from '../src/db/factories.ts'
import { newId } from '../src/shared/ids.ts'

const KEY = Buffer.alloc(32, 7).toString('base64')
const OTHER = Buffer.alloc(32, 9).toString('base64')

/** A database with one comparison written under `key` (null: without encryption). */
function written(key: string | null) {
  useKey(key)
  const db = openDatabase(':memory:')
  const ada = newId()
  createUser(db, { id: ada, name: 'Ada', isAdmin: true })
  applyChanges(db, ada, [{ op: 'create', kind: 'projects', record: makeProject({ name: 'Cabinet' }) }])
  return db
}

afterEach(() => useKey(null))

describe('the server checks DATA_KEY against the stored data at start', () => {
  it('starts with the key the data was written with, and with nothing stored yet', () => {
    expect(keyProblem(written(KEY), './data', true)).toBeNull()
    useKey(OTHER)
    expect(keyProblem(openDatabase(':memory:'), './data', true)).toBeNull()
  })

  it('starts with or without a key when nothing is encrypted', () => {
    const db = written(null)
    useKey(OTHER)
    expect(keyProblem(db, './data', true)).toBeNull()
  })

  it('refuses another key, and says what to do', () => {
    const db = written(KEY)
    useKey(OTHER)
    const problem = keyProblem(db, './data', true)
    expect(problem).toMatch(/DATA_KEY does not match the data in \.\/data/)
    expect(problem).toMatch(/only suits an empty data folder/)
    expect(problem).not.toMatch(/development/)
  })

  it('refuses a missing key for encrypted data; in development it says no key is needed', () => {
    const db = written(KEY)
    useKey(null)
    const problem = keyProblem(db, './data', false)
    expect(problem).toMatch(/is encrypted, but DATA_KEY is not set/)
    expect(problem).toMatch(/npm run dev without DATA_KEY uses the key in \.dev-data-key/)
  })
})

describe('npm run dev encrypts by default', () => {
  it('makes a key once, keeps it for you alone, and uses it on every start', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'propario-key-')), '.dev-data-key')
    const first = devDataKey(undefined, file)
    expect(parseKey(first.key!)).toHaveLength(32)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(first.note).toMatch(/new key/)
    expect(devDataKey(undefined, file).key).toBe(first.key)
    expect(readFileSync(file, 'utf8').trim()).toBe(first.key)
  })

  it('takes DATA_KEY when it is set, and stores unencrypted only with DATA_KEY=off', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'propario-key-')), '.dev-data-key')
    expect(devDataKey(KEY, file).key).toBe(KEY)
    expect(devDataKey('off', file).key).toBeNull()
    expect(() => readFileSync(file)).toThrow()
  })

  it('production refuses DATA_KEY=off', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', ORIGIN: 'https://p.example.org', DATA_KEY: 'off' })).toThrow('development only')
  })
})
