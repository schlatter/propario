import { describe, expect, it } from 'vitest'
import { openCache } from '../src/db/db'

describe("opening this browser's copy", () => {
  it('does not hang when another window holds it while its removal is pending – a fresh copy is used', async () => {
    const userId = 'u-stuck'
    // Another window (an app frozen in the background) holds the copy and never lets go …
    const other = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open(`propario-${userId}`, 10)
      r.onsuccess = () => resolve(r.result)
    })
    other.onversionchange = null
    // … while signing out elsewhere asked for it to be removed.
    indexedDB.deleteDatabase(`propario-${userId}`)

    const started = Date.now()
    const cache = await openCache(userId, 200)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(cache.isOpen()).toBe(true)
    expect(cache.name).toMatch(/^propario-u-stuck-/)
    // The next start goes straight to the fresh copy.
    expect(localStorage.getItem(`pv.cache.${userId}`)).toBe(cache.name)
    other.close()
  })
})
