// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './db.ts'
import { useKey } from './crypto.ts'
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
    expect(problem).toMatch(/For development no key is needed/)
  })
})
