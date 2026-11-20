import { describe, expect, it } from 'vitest'
import { AppDB, openCache } from '../src/db/db'

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

  it('does not hang when another window holds a write on it – a frozen app keeps its transaction open', async () => {
    const userId = 'u-locked'
    const name = `propario-${userId}`
    const setup = new AppDB(name)
    await setup.open()
    setup.close()
    // Another window opened the copy and froze in the middle of writing: its transaction on
    // "meta" never ends, so every later write there waits – opening alone still succeeds.
    const other = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open(name, 10)
      r.onsuccess = () => resolve(r.result)
    })
    let holding = true
    const tx = other.transaction('meta', 'readwrite')
    const keepBusy = () => {
      if (holding) tx.objectStore('meta').get('seq').onsuccess = keepBusy
    }
    keepBusy()

    const started = Date.now()
    const cache = await openCache(userId, 200)
    await cache.meta.put({ key: 'me', value: 'written' })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(cache.name).toMatch(/^propario-u-locked-/)
    expect(localStorage.getItem(`pv.cache.${userId}`)).toBe(cache.name)
    holding = false
    other.close()
  })
})
