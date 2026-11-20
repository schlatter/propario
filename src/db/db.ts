import Dexie, { type EntityTable } from 'dexie'
import type { Product, Project, PropertyDef, Requirement, Settings } from './types'
import { DEFAULT_PEOPLE } from '../config'
import { api } from '../api'
import { report } from '../diagnostics'

/**
 * The browser's copy of what the signed-in person may see. The server is the source of truth:
 * writes go to the server first and land here afterwards (src/sync.ts); this cache makes the
 * interface instant and keeps working while the connection blinks.
 */

interface MetaRow {
  key: string
  value: unknown
}

export class AppDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  products!: EntityTable<Product, 'id'>
  properties!: EntityTable<PropertyDef, 'id'>
  requirements!: EntityTable<Requirement, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      projects: 'id, status, category, updatedAt',
      products: 'id, projectId, updatedAt',
      properties: 'id, projectId',
      requirements: 'id, projectId',
      meta: 'key',
    })
  }
}

/** Browser-only data from before accounts existed (version 0.1); offered for moving to the account. */
export const LEGACY_DB_NAME = 'produktvergleich'

/** The open cache. Replaced on sign-in; an empty in-memory placeholder until then. */
export let db: AppDB = new AppDB('propario-signed-out')

/** How long opening this browser's copy may take before a fresh one is used instead. */
export const OPEN_WAIT = 5000
const nameKey = (userId: string) => `pv.cache.${userId}`

function cacheName(userId: string): string {
  try {
    return localStorage.getItem(nameKey(userId)) || `propario-${userId}`
  } catch {
    return `propario-${userId}`
  }
}

/**
 * Opens this browser's copy of the person's data. A browser database cannot open while its
 * removal is pending, and the removal waits for every other window to let go of it – which an
 * app frozen in the background on a phone may never do. Then the start hung for good. Likewise a
 * window frozen in the middle of a write: the copy opens, but every write waits for that window
 * (seen after updates on Android). So the copy counts as open only once a first write went
 * through. It is only a cache: if that does not happen in a few seconds, a fresh one under a new
 * name is used and the data comes again from the server; the old one is removed once nothing
 * holds it.
 */
export async function openCache(userId: string, wait = OPEN_WAIT): Promise<AppDB> {
  const name = cacheName(userId)
  if (db.name === name && db.isOpen()) return db
  db.close()
  const next = new AppDB(name)
  let phase = 'open'
  const opening = next
    .open()
    .then(() => {
      phase = 'write'
      return next.meta.put({ key: 'opened', value: Date.now() })
    })
    .then(
      () => true,
      () => false,
    )
  const opened = await Promise.race([opening, new Promise<false>((resolve) => setTimeout(() => resolve(false), wait))])
  if (opened) {
    db = next
    return db
  }
  // Whenever the stuck one opens after all, let it go again.
  void opening.then((ok) => ok && next.close())
  report('stuck', `cache ${name}: ${phase} did not finish in ${wait} ms; using a fresh copy`)
  const fresh = `propario-${userId}-${Date.now().toString(36)}`
  try {
    localStorage.setItem(nameKey(userId), fresh)
  } catch {
    /* then the next start tries the old one again */
  }
  void Dexie.delete(name).catch(() => {})
  db = new AppDB(fresh)
  await db.open()
  return db
}

/** Signing out removes the cached copy from this browser – without waiting for other windows. */
export async function dropCache(): Promise<void> {
  const name = db.name
  db.close()
  void Dexie.delete(name).catch(() => {})
  db = new AppDB('propario-signed-out')
}

/** For tests: use this database as the cache. */
export function useCache(database: AppDB) {
  db = database
}

export { newId, nowIso } from '../shared/ids.ts'

export const DEFAULT_SETTINGS: Settings = { people: DEFAULT_PEOPLE, lastBackupAt: null }

/** Settings live on the server (per person); the cache holds the last copy for instant reads. */

export async function getSettings(database: AppDB = db): Promise<Settings> {
  const row = await database.meta.get('settings')
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
}

export async function saveSettings(patch: Partial<Settings>, database: AppDB = db) {
  const next = { ...(await getSettings(database)), ...patch }
  await api('/api/me', { method: 'PATCH', body: { settings: next } })
  await database.meta.put({ key: 'settings', value: next })
}
