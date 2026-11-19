/**
 * Keeps the browser cache in step with the server.
 *
 * - `commit(changes)`: shows changes at once and sends them to the server. If the server refuses
 *   them or cannot be reached, they are taken back and the caller gets the error – nothing stays
 *   that is not saved. While a change is on its way, `onSaving` says so, so the interface can show
 *   it. (A phone's connection often needs seconds after waking up; the interface must not wait.)
 * - `pull()`: asks for everything that changed since the last change number this browser saw,
 *   plus the full list of comparisons it may see (with the role). Runs on start, every few
 *   seconds while the page is visible, when the window gets focus and after each commit.
 */
import type { Table } from 'dexie'
import { api } from './api'
import { db, type AppDB } from './db/db'
import { applyPatch, KINDS, type AnyRecord, type Change, type Kind } from './shared/records.ts'
import { nowIso } from './shared/ids.ts'
import { report } from './diagnostics'
import { debugLog } from './debug'

export type Role = 'owner' | 'editor' | 'viewer'

export interface SyncResult {
  /** The server's build, e.g. 0.2.0+4d837a1 (null in development). */
  version?: string | null
  seq: number
  full: boolean
  projects: { id: string; role: Role }[]
  records: { kind: Kind; data: AnyRecord }[]
  deleted: { kind: Kind; id: string; projectId: string }[]
}

/** How changes reach the server; tests replace it with an in-process one. */
export interface Transport {
  push(changes: Change[]): Promise<void>
  pull(since: number): Promise<SyncResult>
}

export const httpTransport: Transport = {
  async push(changes) {
    // Large imports go in slices so a single request stays small.
    for (let i = 0; i < changes.length; i += 500) await api('/api/changes', { body: { changes: changes.slice(i, i + 500) } })
  },
  pull: (since) => api<SyncResult>(`/api/sync?since=${since}`),
}

let transport: Transport = httpTransport
export function useTransport(t: Transport) {
  transport = t
}

const table = (database: AppDB, kind: Kind) => database[kind] as unknown as Table<AnyRecord, string>

/** Applies accepted changes to the cache, the same way the server did. */
export async function applyLocal(changes: Change[], database: AppDB = db) {
  await database.transaction('rw', [database.projects, database.products, database.properties, database.requirements, database.meta], async () => {
    const touched = new Set<string>()
    for (const c of changes) {
      if (c.op === 'create') {
        await table(database, c.kind).put(c.record)
        if (c.kind !== 'projects') touched.add((c.record as { projectId: string }).projectId)
      } else if (c.op === 'patch') {
        const current = await table(database, c.kind).get(c.id)
        if (current) await table(database, c.kind).put(applyPatch(current, c.patch))
        if (c.kind !== 'projects') touched.add(c.projectId)
      } else if (c.kind === 'projects') {
        await removeProjectLocally(database, c.id)
      } else {
        await table(database, c.kind).delete(c.id)
        touched.add(c.projectId)
      }
    }
    const at = nowIso()
    for (const id of touched) await database.projects.update(id, { updatedAt: at })
  })
}

async function removeProjectLocally(database: AppDB, projectId: string) {
  for (const kind of ['products', 'properties', 'requirements'] as const) await database[kind].where('projectId').equals(projectId).delete()
  await database.projects.delete(projectId)
  const roles = { ...(((await database.meta.get('roles'))?.value as Record<string, Role> | undefined) ?? {}) }
  delete roles[projectId]
  await database.meta.put({ key: 'roles', value: roles })
}

// ---------- changes on their way ----------

let saving = 0
const savingListeners = new Set<(n: number) => void>()
/** Calls `fn` with the number of changes still on their way; returns a function that stops it. */
export function onSaving(fn: (n: number) => void): () => void {
  savingListeners.add(fn)
  fn(saving)
  return () => void savingListeners.delete(fn)
}
const setSaving = (delta: number) => {
  saving += delta
  for (const fn of savingListeners) fn(saving)
}

type Snapshot = { kind: Kind; id: string; record: AnyRecord | undefined }[]

/** The records `changes` will touch, as they are now – to take the changes back. */
async function snapshot(changes: Change[], database: AppDB): Promise<Snapshot> {
  const keys = new Map<string, { kind: Kind; id: string }>()
  for (const c of changes) {
    const id = c.op === 'create' ? c.record.id : c.id
    keys.set(`${c.kind}:${id}`, { kind: c.kind, id })
    // applyLocal also marks the comparison as changed.
    const projectId = c.op === 'create' ? (c.kind === 'projects' ? c.record.id : (c.record as { projectId: string }).projectId) : c.projectId
    keys.set(`projects:${projectId}`, { kind: 'projects', id: projectId })
  }
  return Promise.all([...keys.values()].map(async (k) => ({ ...k, record: await table(database, k.kind).get(k.id) })))
}

async function restore(before: Snapshot, database: AppDB) {
  await database.transaction('rw', [database.projects, database.products, database.properties, database.requirements], async () => {
    for (const s of before) {
      if (s.record) await table(database, s.kind).put(s.record)
      else await table(database, s.kind).delete(s.id)
    }
  })
}

/** Shows changes at once, sends them, and takes them back if they could not be saved. */
export async function commit(changes: Change[]): Promise<void> {
  if (!changes.length) return
  const database = db
  // Deleting a whole comparison waits for the server: it is rare and cannot be put back here.
  if (changes.some((c) => c.op === 'delete' && c.kind === 'projects')) {
    await transport.push(changes)
    await applyLocal(changes, database)
    schedulePull(300)
    return
  }
  const started = performance.now()
  const before = await snapshot(changes, database)
  await applyLocal(changes, database)
  setSaving(1)
  // A save that takes this long tells, in the server log, that the connection is the problem.
  const slow = setTimeout(() => report('slow', `saving ${changes.length} change(s) for 15 s`), 15_000)
  try {
    await transport.push(changes)
  } catch (e) {
    debugLog('save', `${changes.length} change(s) not saved, taken back: ${(e as Error).message}`)
    // Signed out or switched account meanwhile: that cache is gone anyway.
    if (database === db) await restore(before, database)
    throw e
  } finally {
    clearTimeout(slow)
    setSaving(-1)
  }
  debugLog('save', `${changes.length} change(s) saved in ${Math.round(performance.now() - started)} ms`)
  schedulePull(300)
}

let pulling: Promise<void> | null = null

export function pull(): Promise<void> {
  pulling ??= doPull().finally(() => {
    pulling = null
  })
  return pulling
}

async function doPull() {
  const database = db
  const since = ((await database.meta.get('seq'))?.value as number | undefined) ?? 0
  const r = await transport.pull(since)
  if (r.full || r.records.length || r.deleted.length)
    debugLog('sync', `${r.full ? 'full' : 'changes'}: ${r.records.length} records, ${r.deleted.length} removed, seq ${r.seq}`)
  if (database !== db) return // signed out or switched account meanwhile
  await database.transaction('rw', [database.projects, database.products, database.properties, database.requirements, database.meta], async () => {
    const allowed = new Set(r.projects.map((p) => p.id))
    if (r.full) for (const kind of KINDS) await database[kind].clear()
    else {
      for (const p of await database.projects.toArray()) if (!allowed.has(p.id)) await removeProjectLocally(database, p.id)
      for (const d of r.deleted) await table(database, d.kind).delete(d.id)
    }
    for (const kind of KINDS) {
      const rows = r.records.filter((x) => x.kind === kind).map((x) => x.data)
      if (rows.length) await table(database, kind).bulkPut(rows)
    }
    await database.meta.put({ key: 'roles', value: Object.fromEntries(r.projects.map((p) => [p.id, p.role])) })
    await database.meta.put({ key: 'seq', value: r.seq })
    if (r.version) await database.meta.put({ key: 'serverVersion', value: r.version })
  })
}

let timer: ReturnType<typeof setTimeout> | undefined
function schedulePull(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(() => void pull().catch(() => {}), ms)
}

/** Starts background syncing; returns a function that stops it. */
export function startSync(intervalMs = 8000): () => void {
  let stopped = false
  const tick = () => {
    if (stopped) return
    if (document.visibilityState === 'visible') void pull().catch(() => {})
    timer = setTimeout(tick, intervalMs)
  }
  const onFocus = () => void pull().catch(() => {})
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onFocus)
  tick()
  return () => {
    stopped = true
    clearTimeout(timer)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onFocus)
  }
}

/** The signed-in person's role per comparison (from the last sync). */
export async function rolesOf(database: AppDB = db): Promise<Record<string, Role>> {
  return ((await database.meta.get('roles'))?.value as Record<string, Role> | undefined) ?? {}
}

/** New comparisons are the creator's; record the role right away so the interface fits. */
export async function setLocalRole(projectId: string, role: Role, database: AppDB = db) {
  const roles = await rolesOf(database)
  await database.meta.put({ key: 'roles', value: { ...roles, [projectId]: role } })
}
