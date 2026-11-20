import { tx, type DB } from './db.ts'
import { open, openBytes, seal, sealBytes } from './crypto.ts'
import { newId, nowIso } from '../src/shared/ids.ts'
import { applyPatch, checkChange, IMAGE_PATH, KINDS, PERSONAL, type AnyRecord, type Change, type Kind } from '../src/shared/records.ts'

/**
 * Comparisons and everything in them. Private by default, shared on purpose:
 *
 * - The person who creates a comparison owns it. Only the owner shares it (view or edit),
 *   and only the owner deletes it.
 * - Every function that crosses user boundaries takes the acting user's id and checks the role
 *   itself. "Not found" is also the answer for "exists, but not yours".
 *
 * Every write gets a number from a global counter (`seq`), so a browser can ask for everything
 * that changed since the last number it saw.
 */

export type Role = 'owner' | 'editor' | 'viewer'

export class AccessError extends Error {
  status: number
  constructor(message: string, status = 404) {
    super(message)
    this.status = status
  }
}

export function projectRole(db: DB, projectId: string, userId: string): Role | null {
  const row = db
    .prepare(
      `SELECT CASE WHEN p.owner_id = ? THEN 'owner' ELSE m.role END AS role
       FROM projects p LEFT JOIN members m ON m.project_id = p.id AND m.user_id = ?
       WHERE p.id = ?`,
    )
    .get(userId, userId, projectId) as { role: Role | null } | undefined
  return row?.role ?? null
}

const canEdit = (r: Role | null) => r === 'owner' || r === 'editor'

function requireRole(db: DB, projectId: string, userId: string, need: 'view' | 'edit' | 'own'): Role {
  const role = projectRole(db, projectId, userId)
  if (!role) throw new AccessError('not found')
  if (need === 'edit' && !canEdit(role)) throw new AccessError('read only', 403)
  if (need === 'own' && role !== 'owner') throw new AccessError('only the owner may do this', 403)
  return role
}

/** Projects the user may see, with their role. */
export function accessibleProjects(db: DB, userId: string): { id: string; role: Role }[] {
  return db
    .prepare(
      `SELECT id, 'owner' AS role FROM projects WHERE owner_id = ?
       UNION ALL SELECT project_id AS id, role FROM members WHERE user_id = ?`,
    )
    .all(userId, userId) as { id: string; role: Role }[]
}

// ---------- records ----------

const aad = (kind: Kind, id: string) => `record:${kind}:${id}`

function nextSeq(db: DB): number {
  return (db.prepare('UPDATE counter SET seq = seq + 1 WHERE id = 1 RETURNING seq').get() as { seq: number }).seq
}

export function currentSeq(db: DB): number {
  return (db.prepare('SELECT seq FROM counter WHERE id = 1').get() as { seq: number }).seq
}

function readRecord<T = AnyRecord>(db: DB, kind: Kind, id: string): { projectId: string; record: T } | null {
  const row = db.prepare('SELECT project_id, data FROM records WHERE kind = ? AND id = ?').get(kind, id) as { project_id: string; data: string } | undefined
  return row ? { projectId: row.project_id, record: JSON.parse(open(aad(kind, id), row.data)) as T } : null
}

function writeRecord(db: DB, kind: Kind, record: AnyRecord, projectId: string, seq: number): void {
  db.prepare(
    'INSERT INTO records (kind, id, project_id, seq, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT (kind, id) DO UPDATE SET seq = excluded.seq, data = excluded.data',
  ).run(kind, record.id, projectId, seq, seal(aad(kind, record.id), JSON.stringify(record)))
}

/** A comparison's "last changed" moves with every change inside it. */
function touchProject(db: DB, projectId: string, seq: number, at: string): void {
  const current = readRecord(db, 'projects', projectId)
  if (current) writeRecord(db, 'projects', { ...current.record, updatedAt: at } as AnyRecord, projectId, seq)
}

/**
 * Applies a batch of changes from one user, all or nothing. Returns the change number.
 * Throws AccessError (unknown or foreign project, read-only role) or a plain Error (invalid input).
 */
export function applyChanges(db: DB, userId: string, changes: unknown): number {
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 2000) throw new Error('changes must be a non-empty list (at most 2000)')
  for (const c of changes) {
    const problem = checkChange(c)
    if (problem) throw new Error(problem)
  }
  return tx(db, () => {
    const seq = nextSeq(db)
    const at = nowIso()
    const touched = new Set<string>()
    for (const c of changes as Change[]) {
      if (c.op === 'create') {
        const r = c.record as AnyRecord & { projectId?: string }
        if (c.kind === 'projects') {
          if (db.prepare('SELECT 1 FROM projects WHERE id = ?').get(r.id)) throw new AccessError('project exists', 409)
          db.prepare('INSERT INTO projects (id, owner_id) VALUES (?, ?)').run(r.id, userId)
          writeRecord(db, 'projects', r, r.id, seq)
        } else {
          requireRole(db, r.projectId!, userId, 'edit')
          const existing = db.prepare('SELECT project_id FROM records WHERE kind = ? AND id = ?').get(c.kind, r.id) as { project_id: string } | undefined
          if (existing) throw new AccessError('record exists', 409)
          writeRecord(db, c.kind, r, r.projectId!, seq)
          touched.add(r.projectId!)
        }
      } else if (c.op === 'patch') {
        requireRole(db, c.projectId, userId, 'edit')
        // Each person casts only their own vote, sets only their own star and ranking.
        for (const key of PERSONAL)
          if (c.patch[key] && Object.keys(c.patch[key] as object).some((k) => k !== userId))
            throw new AccessError(key === 'votes' ? 'own vote only' : `own ${key} only`, 403)
        const current = readRecord(db, c.kind, c.id)
        if (!current || current.projectId !== c.projectId) throw new AccessError('not found')
        writeRecord(db, c.kind, applyPatch(current.record, c.patch), c.projectId, seq)
        if (c.kind !== 'projects') touched.add(c.projectId)
      } else {
        if (c.kind === 'projects') {
          if (c.id !== c.projectId) throw new Error('a project delete names the project itself')
          requireRole(db, c.id, userId, 'own')
          db.prepare('DELETE FROM projects WHERE id = ?').run(c.id) // records, members, images cascade
          touched.delete(c.id)
          continue
        }
        requireRole(db, c.projectId, userId, 'edit')
        const r = db.prepare('DELETE FROM records WHERE kind = ? AND id = ? AND project_id = ?').run(c.kind, c.id, c.projectId)
        if (r.changes) {
          db.prepare('INSERT INTO tombstones (seq, kind, id, project_id, deleted_at) VALUES (?, ?, ?, ?, ?)').run(seq, c.kind, c.id, c.projectId, Date.now())
          touched.add(c.projectId)
        }
      }
    }
    for (const projectId of touched) touchProject(db, projectId, seq, at)
    return seq
  })
}

export interface SyncResult {
  seq: number
  /** True when everything is sent (first sync, or `since` older than the kept tombstones). */
  full: boolean
  projects: { id: string; role: Role }[]
  records: { kind: Kind; data: AnyRecord }[]
  deleted: { kind: Kind; id: string; projectId: string }[]
}

/** Everything the user may see that changed after `since`. The project list is always complete. */
export function sync(db: DB, userId: string, since: number): SyncResult {
  const seq = currentSeq(db)
  const pruned = (db.prepare('SELECT pruned FROM counter WHERE id = 1').get() as { pruned: number }).pruned
  const full = !(since > 0) || since < pruned || since > seq
  const from = full ? 0 : since
  const projects = accessibleProjects(db, userId)
  const records: SyncResult['records'] = []
  const deleted: SyncResult['deleted'] = []
  const rows = db.prepare('SELECT kind, id, data FROM records WHERE project_id = ? AND seq > ?')
  const gone = db.prepare('SELECT kind, id, project_id FROM tombstones WHERE project_id = ? AND seq > ?')
  for (const p of projects) {
    for (const r of rows.all(p.id, from) as { kind: Kind; id: string; data: string }[]) {
      records.push({ kind: r.kind, data: JSON.parse(open(aad(r.kind, r.id), r.data)) as AnyRecord })
    }
    if (!full) {
      for (const t of gone.all(p.id, from) as { kind: Kind; id: string; project_id: string }[])
        deleted.push({ kind: t.kind, id: t.id, projectId: t.project_id })
    }
  }
  return { seq, full, projects, records, deleted }
}

// ---------- sharing ----------

export function listMembers(db: DB, userId: string, projectId: string): { userId: string; name: string; role: Role }[] {
  requireRole(db, projectId, userId, 'view')
  return db
    .prepare(
      `SELECT u.id AS userId, u.name, 'owner' AS role FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?
       UNION ALL
       SELECT u.id, u.name, m.role FROM members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ?`,
    )
    .all(projectId, projectId) as { userId: string; name: string; role: Role }[]
}

/** The owner shares (viewer/editor) or stops sharing (null). */
export function setMember(db: DB, userId: string, projectId: string, memberId: string, role: 'viewer' | 'editor' | null): void {
  requireRole(db, projectId, userId, 'own')
  if (memberId === userId) throw new Error('the owner cannot change their own role')
  if (role !== null && role !== 'viewer' && role !== 'editor') throw new Error('invalid role')
  tx(db, () => {
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(memberId)) throw new AccessError('not found')
    const before = db.prepare('SELECT role FROM members WHERE project_id = ? AND user_id = ?').get(projectId, memberId)
    if (role === null) {
      db.prepare('DELETE FROM members WHERE project_id = ? AND user_id = ?').run(projectId, memberId)
      return
    }
    db.prepare('INSERT INTO members (project_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET role = excluded.role').run(projectId, memberId, role)
    // A new member's browser only asks for changes after its last number: lift the whole
    // comparison above it so it arrives in full.
    if (!before) db.prepare('UPDATE records SET seq = ? WHERE project_id = ?').run(nextSeq(db), projectId)
  })
}

// ---------- images ----------

export const IMAGE_TYPES: Record<string, (b: Buffer) => boolean> = {
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
}
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024

/** Stores an image for a comparison; the type is decided from its bytes, never from the request. */
export function saveImage(db: DB, userId: string, projectId: string, bytes: Buffer): string {
  requireRole(db, projectId, userId, 'edit')
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error('image too large')
  const type = Object.keys(IMAGE_TYPES).find((t) => IMAGE_TYPES[t](bytes))
  if (!type) throw new Error('not a WebP, JPEG or PNG image')
  const id = newId()
  db.prepare('INSERT INTO images (id, project_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    projectId,
    type,
    sealBytes(`image:${id}`, bytes),
    Date.now(),
  )
  return `/api/images/${id}`
}

export function readImage(db: DB, userId: string, id: string): { type: string; bytes: Buffer } | null {
  const row = db.prepare('SELECT project_id, type, data FROM images WHERE id = ?').get(id) as { project_id: string; type: string; data: Uint8Array } | undefined
  if (!row || !projectRole(db, row.project_id, userId)) return null
  return { type: row.type, bytes: openBytes(`image:${id}`, Buffer.from(row.data)) }
}

// ---------- housekeeping ----------

const TOMBSTONE_MS = 90 * 24 * 3600 * 1000

/** Removes images no product points to any more (after an hour's grace) and old tombstones. */
export function collectGarbage(db: DB, now = Date.now()): { images: number; tombstones: number } {
  const used = new Set<string>()
  for (const r of db.prepare("SELECT id, data FROM records WHERE kind = 'products'").all() as { id: string; data: string }[]) {
    // The main picture and any further ones (a dimension drawing, another view).
    const p = JSON.parse(open(aad('products', r.id), r.data)) as { image?: string; images?: string[] }
    for (const image of [p.image, ...(p.images ?? [])]) if (image && IMAGE_PATH.test(image)) used.add(image.slice('/api/images/'.length))
  }
  let images = 0
  for (const { id } of db.prepare('SELECT id FROM images WHERE created_at < ?').all(now - 3600_000) as { id: string }[]) {
    if (!used.has(id)) images += Number(db.prepare('DELETE FROM images WHERE id = ?').run(id).changes)
  }
  const tombstones = tx(db, () => {
    const old = db.prepare('SELECT max(seq) AS seq FROM tombstones WHERE deleted_at < ?').get(now - TOMBSTONE_MS) as { seq: number | null }
    if (old.seq === null) return 0
    db.prepare('UPDATE counter SET pruned = max(pruned, ?) WHERE id = 1').run(old.seq)
    return Number(db.prepare('DELETE FROM tombstones WHERE seq <= ?').run(old.seq).changes)
  })
  return { images, tombstones }
}

/** Every comparison the user owns, for export and tests. */
export function ownedProjectIds(db: DB, userId: string): string[] {
  return (db.prepare('SELECT id FROM projects WHERE owner_id = ?').all(userId) as { id: string }[]).map((r) => r.id)
}

export { KINDS }
