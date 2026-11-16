import Dexie, { type EntityTable } from 'dexie'
import type { Product, Project, PropertyDef, Requirement, Settings } from './types'
import { DEFAULT_PEOPLE } from '../config'
import { api } from '../api'

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

export async function openCache(userId: string): Promise<AppDB> {
  if (db.name !== `propario-${userId}`) {
    db.close()
    db = new AppDB(`propario-${userId}`)
    await db.open()
  }
  return db
}

/** Signing out removes the cached copy from this browser. */
export async function dropCache(): Promise<void> {
  const name = db.name
  db.close()
  await Dexie.delete(name)
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
