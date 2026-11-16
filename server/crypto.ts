import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Encryption at rest and secret handling.
 *
 * Record contents, images and personal settings are encrypted with AES-256-GCM and a random
 * 96-bit nonce per value. The value's identity (e.g. `record:products:<id>`) is bound in as
 * associated data, so a value cannot be moved to another row. The key (`DATA_KEY`, 32 random
 * bytes in base64) lives outside the data directory: a copied database file or backup alone
 * reveals nothing but ids, roles and timestamps. Values are stored as `v1.<base64url>`.
 *
 * Without a key (development, tests) values are stored as they are; the server refuses to start
 * without one in production (env.ts). Secrets (sessions, invites, recovery keys) are only ever
 * stored as SHA-256 hashes.
 */

const PREFIX = 'v1.'
const BYTES_PREFIX = Buffer.from('PV1')

export function parseKey(value: string): Buffer {
  const key = Buffer.from(value.trim(), 'base64')
  if (key.length !== 32) throw new Error('DATA_KEY must be 32 random bytes in base64, e.g. `openssl rand -base64 32`')
  return key
}

let key: Buffer | null | undefined

function currentKey(): Buffer | null {
  if (key === undefined) key = process.env.DATA_KEY ? parseKey(process.env.DATA_KEY) : null
  return key
}

/** For tests and scripts: use this key from now on (null: none). */
export function useKey(value: string | null): void {
  key = value === null ? null : parseKey(value)
}

export const hasKey = () => currentKey() !== null

function encrypt(secret: Buffer, aad: string, plain: Buffer): Buffer {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret, nonce)
  cipher.setAAD(Buffer.from(aad))
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([nonce, body, cipher.getAuthTag()])
}

function decrypt(secret: Buffer, aad: string, bytes: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(bytes.subarray(bytes.length - 16))
  return Buffer.concat([decipher.update(bytes.subarray(12, bytes.length - 16)), decipher.final()])
}

export function seal(aad: string, text: string): string {
  const secret = currentKey()
  if (!secret || text === '') return text
  return PREFIX + encrypt(secret, aad, Buffer.from(text, 'utf8')).toString('base64url')
}

/** Decrypts, or passes values written without a key through unchanged. */
export function open(aad: string, value: string): string {
  if (!value.startsWith(PREFIX)) return value
  const secret = currentKey()
  if (!secret) throw new Error('Encrypted data, but no DATA_KEY')
  return decrypt(secret, aad, Buffer.from(value.slice(PREFIX.length), 'base64url')).toString('utf8')
}

export function sealBytes(aad: string, plain: Buffer): Buffer {
  const secret = currentKey()
  if (!secret) return plain
  return Buffer.concat([BYTES_PREFIX, encrypt(secret, aad, plain)])
}

export function openBytes(aad: string, stored: Buffer): Buffer {
  if (!stored.subarray(0, 3).equals(BYTES_PREFIX)) return stored
  const secret = currentKey()
  if (!secret) throw new Error('Encrypted data, but no DATA_KEY')
  return decrypt(secret, aad, stored.subarray(3))
}

/** A random secret for links and cookies (256 bit, URL-safe). */
export const newToken = () => randomBytes(32).toString('base64url')

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Recovery keys are typed by hand: 4 groups of 5 unambiguous characters (≈ 100 bit). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function newRecoveryKey(): string {
  const bytes = randomBytes(20)
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length])
  return [0, 5, 10, 15].map((i) => chars.slice(i, i + 5).join('')).join('-')
}
export const normalizeRecoveryKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
