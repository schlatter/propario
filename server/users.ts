import { tx, type DB } from './db.ts'
import { hashToken, newRecoveryKey, newToken, normalizeRecoveryKey, open, seal, safeEqual } from './crypto.ts'
import { newId } from '../src/shared/ids.ts'

/**
 * Accounts, sessions, invitations and WebAuthn challenges.
 * There are no passwords and no e-mail addresses: a display name and passkeys are enough.
 */

export interface User {
  id: string
  name: string
  isAdmin: boolean
}

export const SESSION_IDLE_MS = 30 * 24 * 3600 * 1000
export const SESSION_MAX_MS = 90 * 24 * 3600 * 1000
export const INVITE_MS = 14 * 24 * 3600 * 1000
export const CHALLENGE_MS = 5 * 60 * 1000

/** Shortened id for logs: enough to correlate, nothing personal. */
export const shortId = (id: string) => id.slice(0, 8)

export function audit(event: string, userId?: string, extra = ''): void {
  console.log(`[audit] ${new Date().toISOString()} ${event}${userId ? ` user=${shortId(userId)}` : ''}${extra ? ` ${extra}` : ''}`)
}

type UserRow = { id: string; name: string; is_admin: number }
const toUser = (r: UserRow): User => ({ id: r.id, name: r.name, isAdmin: r.is_admin === 1 })

export function countUsers(db: DB): number {
  return (db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n
}

export function getUser(db: DB, id: string): User | null {
  const row = db.prepare('SELECT id, name, is_admin FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? toUser(row) : null
}

export function listUsers(db: DB): User[] {
  return (db.prepare('SELECT id, name, is_admin FROM users ORDER BY name COLLATE NOCASE').all() as UserRow[]).map(toUser)
}

export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const n = name.replace(/\s+/g, ' ').trim()
  return n.length >= 1 && n.length <= 60 ? n : null
}

/** Creates the account and returns its one-time recovery key (shown once, stored as a hash). */
export function createUser(db: DB, u: { id: string; name: string; isAdmin: boolean }): { recoveryKey: string } {
  const recoveryKey = newRecoveryKey()
  db.prepare('INSERT INTO users (id, name, is_admin, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
    u.id,
    u.name,
    u.isAdmin ? 1 : 0,
    hashToken(normalizeRecoveryKey(recoveryKey)),
    Date.now(),
  )
  return { recoveryKey }
}

export function renameUser(db: DB, id: string, name: string): void {
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id)
}

/** Deletes the account; its own comparisons (and their images) go with it, shares are removed. */
export function deleteUser(db: DB, id: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

/** Settings are personal (names of people who rate): encrypted at rest. */
export function getSettings(db: DB, userId: string): Record<string, unknown> {
  const row = db.prepare('SELECT settings FROM users WHERE id = ?').get(userId) as { settings: string } | undefined
  if (!row?.settings) return {}
  try {
    return JSON.parse(open(`settings:${userId}`, row.settings)) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function saveSettings(db: DB, userId: string, settings: Record<string, unknown>): void {
  db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(seal(`settings:${userId}`, JSON.stringify(settings)), userId)
}

// ---------- recovery ----------

/** Signs in with the recovery key, which then is replaced: each key works exactly once. */
export function useRecoveryKey(db: DB, typed: string): { userId: string; recoveryKey: string } | null {
  const hash = hashToken(normalizeRecoveryKey(typed))
  return tx(db, () => {
    const row = db.prepare('SELECT id, recovery_hash FROM users WHERE recovery_hash = ?').get(hash) as { id: string; recovery_hash: string } | undefined
    if (!row || !safeEqual(row.recovery_hash, hash)) return null
    const recoveryKey = newRecoveryKey()
    db.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').run(hashToken(normalizeRecoveryKey(recoveryKey)), row.id)
    return { userId: row.id, recoveryKey }
  })
}

export function renewRecoveryKey(db: DB, userId: string): string {
  const recoveryKey = newRecoveryKey()
  db.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').run(hashToken(normalizeRecoveryKey(recoveryKey)), userId)
  return recoveryKey
}

// ---------- sessions ----------

export function createSession(db: DB, userId: string, now = Date.now()): string {
  const token = newToken()
  db.prepare('INSERT INTO sessions (hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)').run(hashToken(token), userId, now, now)
  return token
}

/** The session's user, or null when unknown or expired (idle 30 days, at most 90 days). */
export function sessionUser(db: DB, token: string | undefined, now = Date.now()): User | null {
  if (!token) return null
  const hash = hashToken(token)
  const row = db
    .prepare('SELECT s.created_at, s.seen_at, u.id, u.name, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ?')
    .get(hash) as (UserRow & { created_at: number; seen_at: number }) | undefined
  if (!row) return null
  if (now - row.seen_at > SESSION_IDLE_MS || now - row.created_at > SESSION_MAX_MS) {
    db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash)
    return null
  }
  // Writing on every request is wasteful; a minute of precision is plenty.
  if (now - row.seen_at > 60_000) db.prepare('UPDATE sessions SET seen_at = ? WHERE hash = ?').run(now, hash)
  return toUser(row)
}

export function endSession(db: DB, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM sessions WHERE hash = ?').run(hashToken(token))
}

export function endAllSessions(db: DB, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

// ---------- invitations ----------

export interface Invite {
  id: string
  label: string
  createdAt: number
  expiresAt: number
}

/** Creates a single-use invitation; the token is returned once and stored as a hash. */
export function createInvite(db: DB, createdBy: string, label: string, now = Date.now()): { id: string; token: string } {
  const token = newToken()
  const id = newId()
  db.prepare('INSERT INTO invites (id, hash, created_by, label, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    hashToken(token),
    createdBy,
    label,
    now,
    now + INVITE_MS,
  )
  return { id, token }
}

export function listInvites(db: DB, now = Date.now()): Invite[] {
  return (
    db.prepare('SELECT id, label, created_at, expires_at FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC').all(now) as {
      id: string
      label: string
      created_at: number
      expires_at: number
    }[]
  ).map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, expiresAt: r.expires_at }))
}

export function revokeInvite(db: DB, id: string): void {
  db.prepare('DELETE FROM invites WHERE id = ?').run(id)
}

export function inviteValid(db: DB, token: string, now = Date.now()): boolean {
  const row = db.prepare('SELECT used_at, expires_at FROM invites WHERE hash = ?').get(hashToken(token)) as
    { used_at: number | null; expires_at: number } | undefined
  return !!row && row.used_at === null && row.expires_at > now
}

/** Marks the invitation as used; false if it was already used or expired (call inside the account's transaction). */
export function consumeInvite(db: DB, token: string, now = Date.now()): boolean {
  const r = db.prepare('UPDATE invites SET used_at = ? WHERE hash = ? AND used_at IS NULL AND expires_at > ?').run(now, hashToken(token), now)
  return r.changes === 1
}

// ---------- WebAuthn challenges ----------

export function saveChallenge(db: DB, kind: string, challenge: string, payload: unknown, now = Date.now()): string {
  const id = newId()
  db.prepare('INSERT INTO challenges (id, kind, challenge, payload, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    kind,
    challenge,
    JSON.stringify(payload),
    now + CHALLENGE_MS,
  )
  return id
}

/** Returns and deletes a challenge: each one can be answered once, within five minutes. */
export function takeChallenge(db: DB, id: unknown, kind: string, now = Date.now()): { challenge: string; payload: unknown } | null {
  if (typeof id !== 'string') return null
  const row = db.prepare('DELETE FROM challenges WHERE id = ? AND kind = ? RETURNING challenge, payload, expires_at').get(id, kind) as
    { challenge: string; payload: string; expires_at: number } | undefined
  if (!row || row.expires_at < now) return null
  return { challenge: row.challenge, payload: JSON.parse(row.payload) }
}

// ---------- passkeys ----------

export interface PasskeyRow {
  id: string
  userId: string
  publicKey: Uint8Array
  counter: number
  transports: string[]
}

export function insertPasskey(db: DB, p: PasskeyRow): void {
  db.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    p.id,
    p.userId,
    p.publicKey,
    p.counter,
    p.transports.join(','),
    Date.now(),
  )
}

export function getPasskey(db: DB, id: string): PasskeyRow | null {
  const r = db.prepare('SELECT id, user_id, public_key, counter, transports FROM passkeys WHERE id = ?').get(id) as
    { id: string; user_id: string; public_key: Uint8Array; counter: number; transports: string } | undefined
  return r
    ? { id: r.id, userId: r.user_id, publicKey: new Uint8Array(r.public_key), counter: r.counter, transports: r.transports ? r.transports.split(',') : [] }
    : null
}

export function listPasskeys(db: DB, userId: string): { id: string; createdAt: number; lastUsedAt: number | null; transports: string[] }[] {
  return (
    db.prepare('SELECT id, created_at, last_used_at, transports FROM passkeys WHERE user_id = ? ORDER BY created_at').all(userId) as {
      id: string
      created_at: number
      last_used_at: number | null
      transports: string
    }[]
  ).map((r) => ({ id: r.id, createdAt: r.created_at, lastUsedAt: r.last_used_at, transports: r.transports ? r.transports.split(',') : [] }))
}

export function touchPasskey(db: DB, id: string, counter: number): void {
  db.prepare('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?').run(counter, Date.now(), id)
}

/** Removes a passkey unless it is the account's last one. */
export function removePasskey(db: DB, userId: string, id: string): boolean {
  return tx(db, () => {
    const n = (db.prepare('SELECT count(*) AS n FROM passkeys WHERE user_id = ?').get(userId) as { n: number }).n
    if (n <= 1) return false
    return db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').run(id, userId).changes === 1
  })
}

// ---------- housekeeping ----------

export function purgeExpired(db: DB, now = Date.now()): void {
  db.prepare('DELETE FROM sessions WHERE seen_at < ? OR created_at < ?').run(now - SESSION_IDLE_MS, now - SESSION_MAX_MS)
  db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(now)
  db.prepare('DELETE FROM invites WHERE expires_at < ? OR used_at IS NOT NULL').run(now)
}
