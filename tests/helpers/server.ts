/**
 * The real server logic (server/store.ts on an in-memory SQLite database) wired straight into
 * the browser's sync code, so tests cover both sides without HTTP. JSON round-trips mimic the wire.
 */
import { openDatabase } from '../../server/db.ts'
import { applyChanges, sync } from '../../server/store.ts'
import { createUser } from '../../server/users.ts'
import { AppDB, useCache } from '../../src/db/db'
import { newId } from '../../src/shared/ids.ts'
import { pull, useTransport, type SyncResult, type Transport } from '../../src/sync'

const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function testServer() {
  const db = openDatabase(':memory:')
  const transportFor = (userId: string): Transport => ({
    async push(changes) {
      applyChanges(db, userId, wire(changes))
    },
    async pull(since) {
      return wire(sync(db, userId, since)) as SyncResult
    },
  })
  /** A person with their own browser cache. `use()` makes it the active browser. */
  const person = (name: string, isAdmin = false) => {
    const id = newId()
    createUser(db, { id, name, isAdmin })
    const cache = new AppDB(`test-${id}`)
    return {
      id,
      cache,
      async use() {
        useCache(cache)
        useTransport(transportFor(id))
      },
      async refresh() {
        await this.use()
        await pull()
      },
    }
  }
  return { db, person }
}
