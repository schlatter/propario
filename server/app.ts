import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { DB } from './db.ts'
import type { Config } from './env.ts'
import { newToken } from './crypto.ts'
import { allow } from './ratelimit.ts'
import { encodeFacts, fetchProductImage, ImageFetchError } from './product-image.ts'
import { AccessError, applyChanges, listMembers, readImage, saveImage, setMember, sync, MAX_IMAGE_BYTES } from './store.ts'
import * as users from './users.ts'
import * as webauthn from './webauthn.ts'

/**
 * The HTTP side of Propario: security headers on every response, sessions, the CSRF check and
 * the JSON API. Static files are served by main.ts (production) or Vite (development).
 */

export type Next = () => void

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React writes style attributes (column widths, positions); no inline <style> or scripts.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ')

export function securityHeaders(res: ServerResponse, https: boolean, csp = CSP): void {
  if (csp) res.setHeader('Content-Security-Policy', csp)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()')
  if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
}

class HttpError extends Error {
  status: number
  constructor(status: number, code: string) {
    super(code)
    this.status = status
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...headers })
  res.end(text)
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new HttpError(413, 'too-large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson(req: IncomingMessage, limit = 16 * 1024 * 1024): Promise<Record<string, unknown>> {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'json-only')
  try {
    const value = JSON.parse((await readBody(req, limit)).toString('utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(400, 'invalid-json')
  }
}

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

export interface App {
  /** Handles /healthz and /api/*; calls next() for everything else. */
  handle: (req: IncomingMessage, res: ServerResponse, next: Next) => void
  /** One-time link for the first account while none exists (null afterwards). */
  setupLink: () => string | null
}

export function createApp(db: DB, config: Config, version: string | null = null): App {
  const https = config.origin.startsWith('https:')
  const rp = webauthn.relyingParty(config.origin)
  const cookieName = https ? '__Host-propario' : 'propario'
  // The setup secret lives in memory only and changes with every start.
  let setupToken: string | null = users.countUsers(db) === 0 ? newToken() : null

  const sessionCookie = (token: string | null) =>
    `${cookieName}=${token ?? ''}; Path=/; HttpOnly; SameSite=Strict${https ? '; Secure' : ''}; Max-Age=${token ? users.SESSION_MAX_MS / 1000 : 0}`

  const clientAddress = (req: IncomingMessage) => {
    if (config.addressHeader) {
      const list = String(req.headers[config.addressHeader] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const picked = list[list.length - config.xffDepth]
      if (picked) return picked
    }
    return req.socket.remoteAddress || 'unknown'
  }

  const limit = (key: string, max: number, windowMs: number) => {
    if (!allow(key, max, windowMs)) throw new HttpError(429, 'rate-limited')
  }

  async function route(req: IncomingMessage, res: ServerResponse, path: string, url: URL): Promise<void> {
    const method = req.method || 'GET'
    const token = cookies(req)[cookieName]
    const user = users.sessionUser(db, token)
    const ip = clientAddress(req)

    // CSRF: state-changing requests must come from this origin (and carry JSON or an image).
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = req.headers.origin
      const site = req.headers['sec-fetch-site']
      if (origin !== config.origin || (site && site !== 'same-origin')) throw new HttpError(403, 'cross-site')
    }

    const signIn = (userId: string) => ({ 'Set-Cookie': sessionCookie(users.createSession(db, userId)) })
    const need = () => {
      if (!user) throw new HttpError(401, 'signed-out')
      return user
    }
    const needAdmin = () => {
      const u = need()
      if (!u.isAdmin) throw new HttpError(403, 'admin-only')
      return u
    }

    // ---------- session and sign-in ----------
    if (path === '/api/session' && method === 'GET') {
      return send(res, 200, {
        user: user ? { ...user, settings: users.getSettings(db, user.id) } : null,
        setupNeeded: setupToken !== null,
        imageFetch: config.imageFetch,
        version,
      })
    }
    // "Reset this browser" (public/reset.html): the browser itself clears Propario's cached files,
    // stored data and service worker – also when its storage no longer answers to scripts. The
    // sign-in cookie stays, so the person is still signed in afterwards.
    if (path === '/api/reset-browser' && method === 'GET') {
      res.writeHead(303, { 'Clear-Site-Data': '"cache", "storage"', Location: '/reset.html?done=1', 'Cache-Control': 'no-store' })
      return void res.end()
    }
    // A browser reports what broke (src/diagnostics.ts), so the log tells why a page stayed blank.
    // Also without a session: the app may hang before it knows who is signed in.
    if (path === '/api/client-error' && method === 'POST') {
      limit(`client-error:${ip}`, 20, 600_000)
      const b = await readJson(req, 16 * 1024)
      // One line per report; only printable text, nothing that could fake further log lines.
      const field = (v: unknown, max: number) =>
        typeof v === 'string'
          ? v
              .replace(/[^\x20-\x7e\u00a0-\uffff]+/g, ' ')
              .trim()
              .slice(0, max)
          : ''
      const ref = /^[0-9a-f]{8}$/.test(String(b.ref)) ? String(b.ref) : '-'
      console.error(
        `[client] ref=${ref} user=${user?.id ?? '-'} kind=${field(b.kind, 20) || '-'} step=${field(b.step, 20) || '-'} version=${field(b.version, 40) || '-'}` +
          ` path=${field(b.path, 200).split('?')[0] || '-'} message=${JSON.stringify(field(b.message, 500))} stack=${JSON.stringify(field(b.stack, 1500))}` +
          (b.log ? ` log=${JSON.stringify(field(b.log, 2000))}` : ''),
      )
      return send(res, 200, { ok: true })
    }
    if (path === '/api/auth/register/begin' && method === 'POST') {
      limit(`register:${ip}`, 20, 600_000)
      const body = await readJson(req)
      const name = users.cleanName(body.name)
      if (!name) throw new HttpError(400, 'name')
      const grant = { setup: typeof body.setup === 'string' ? body.setup : undefined, invite: typeof body.invite === 'string' ? body.invite : undefined }
      const started = await webauthn.beginRegistration(db, rp, setupToken, { name, grant })
      if (!started) throw new HttpError(403, 'invite-invalid')
      return send(res, 200, started)
    }
    if (path === '/api/auth/register/finish' && method === 'POST') {
      limit(`register:${ip}`, 20, 600_000)
      const body = await readJson(req)
      const done = await webauthn.finishRegistration(db, rp, setupToken, body.challengeId, body.response as RegistrationResponseJSON)
      if (!done) throw new HttpError(400, 'passkey-failed')
      if (done.isAdmin) setupToken = null
      users.audit('account-created', done.userId, done.isAdmin ? 'admin' : 'invited')
      return send(res, 200, { recoveryKey: done.recoveryKey }, signIn(done.userId))
    }
    if (path === '/api/auth/login/begin' && method === 'POST') {
      limit(`login:${ip}`, 30, 600_000)
      return send(res, 200, await webauthn.beginLogin(db, rp))
    }
    if (path === '/api/auth/login/finish' && method === 'POST') {
      limit(`login:${ip}`, 30, 600_000)
      const body = await readJson(req)
      const userId = await webauthn.finishLogin(db, rp, body.challengeId, body.response as AuthenticationResponseJSON)
      if (!userId) {
        users.audit('sign-in-failed', undefined, `ip=${ip}`)
        throw new HttpError(401, 'passkey-failed')
      }
      users.audit('sign-in', userId)
      return send(res, 200, { ok: true }, signIn(userId))
    }
    if (path === '/api/auth/recover' && method === 'POST') {
      limit(`recover:${ip}`, 10, 3600_000)
      const body = await readJson(req)
      const used = typeof body.key === 'string' ? users.useRecoveryKey(db, body.key) : null
      if (!used) {
        users.audit('recovery-failed', undefined, `ip=${ip}`)
        throw new HttpError(401, 'recovery-invalid')
      }
      users.audit('recovery-used', used.userId)
      return send(res, 200, { recoveryKey: used.recoveryKey }, signIn(used.userId))
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      users.endSession(db, token)
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(null) })
    }

    // Everything below needs a session.
    const me = need()

    // ---------- account ----------
    if (path === '/api/me' && method === 'PATCH') {
      const body = await readJson(req)
      if ('name' in body) {
        const name = users.cleanName(body.name)
        if (!name) throw new HttpError(400, 'name')
        users.renameUser(db, me.id, name)
      }
      if ('settings' in body) {
        const s = body.settings
        if (!s || typeof s !== 'object' || JSON.stringify(s).length > 20_000) throw new HttpError(400, 'settings')
        users.saveSettings(db, me.id, s as Record<string, unknown>)
      }
      return send(res, 200, { ok: true })
    }
    if (path === '/api/me' && method === 'DELETE') {
      const body = await readJson(req)
      if (body.confirm !== me.name) throw new HttpError(400, 'confirm')
      users.deleteUser(db, me.id)
      users.audit('account-deleted', me.id)
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(null) })
    }
    if (path === '/api/me/recovery-key' && method === 'POST') {
      users.audit('recovery-key-renewed', me.id)
      return send(res, 200, { recoveryKey: users.renewRecoveryKey(db, me.id) })
    }
    if (path === '/api/me/sign-out-everywhere' && method === 'POST') {
      users.endAllSessions(db, me.id)
      users.audit('signed-out-everywhere', me.id)
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(null) })
    }
    if (path === '/api/passkeys' && method === 'GET') return send(res, 200, users.listPasskeys(db, me.id))
    if (path === '/api/passkeys/begin' && method === 'POST') return send(res, 200, await webauthn.beginAddPasskey(db, rp, me))
    if (path === '/api/passkeys/finish' && method === 'POST') {
      const body = await readJson(req)
      if (!(await webauthn.finishAddPasskey(db, rp, me, body.challengeId, body.response as RegistrationResponseJSON)))
        throw new HttpError(400, 'passkey-failed')
      users.audit('passkey-added', me.id)
      return send(res, 200, { ok: true })
    }
    const passkeyMatch = path.match(/^\/api\/passkeys\/([A-Za-z0-9_-]{1,512})$/)
    if (passkeyMatch && method === 'DELETE') {
      if (!users.removePasskey(db, me.id, passkeyMatch[1])) throw new HttpError(409, 'last-passkey')
      users.audit('passkey-removed', me.id)
      return send(res, 200, { ok: true })
    }

    // ---------- people on this instance ----------
    if (path === '/api/users' && method === 'GET') return send(res, 200, users.listUsers(db))
    const userMatch = path.match(/^\/api\/users\/([0-9a-f-]{36})$/)
    if (userMatch && method === 'DELETE') {
      const admin = needAdmin()
      if (userMatch[1] === admin.id) throw new HttpError(400, 'self')
      users.deleteUser(db, userMatch[1])
      users.audit('account-removed', userMatch[1], `by=${users.shortId(admin.id)}`)
      return send(res, 200, { ok: true })
    }
    if (path === '/api/invites' && method === 'GET') {
      needAdmin()
      return send(res, 200, users.listInvites(db))
    }
    if (path === '/api/invites' && method === 'POST') {
      const admin = needAdmin()
      const body = await readJson(req)
      const label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) : ''
      const { id, token: invite } = users.createInvite(db, admin.id, label)
      users.audit('invite-created', admin.id)
      return send(res, 200, { id, link: `${config.origin}/join?invite=${invite}` })
    }
    const inviteMatch = path.match(/^\/api\/invites\/([0-9a-f-]{36})$/)
    if (inviteMatch && method === 'DELETE') {
      needAdmin()
      users.revokeInvite(db, inviteMatch[1])
      return send(res, 200, { ok: true })
    }

    // ---------- comparisons ----------
    if (path === '/api/sync' && method === 'GET') {
      // The running version travels along, so open pages notice an update.
      return send(res, 200, { ...sync(db, me.id, Number(url.searchParams.get('since') || 0)), version })
    }
    if (path === '/api/changes' && method === 'POST') {
      const body = await readJson(req)
      return send(res, 200, { seq: applyChanges(db, me.id, body.changes) })
    }
    const membersMatch = path.match(/^\/api\/projects\/([0-9a-f-]{36})\/members$/)
    if (membersMatch && method === 'GET') return send(res, 200, listMembers(db, me.id, membersMatch[1]))
    if (membersMatch && method === 'PUT') {
      const body = await readJson(req)
      setMember(db, me.id, membersMatch[1], String(body.userId), (body.role ?? null) as 'viewer' | 'editor' | null)
      users.audit(body.role ? 'shared' : 'unshared', me.id)
      return send(res, 200, { ok: true })
    }

    // ---------- images ----------
    if (path === '/api/images' && method === 'POST') {
      limit(`upload:${me.id}`, 600, 600_000)
      const project = url.searchParams.get('project') || ''
      const bytes = await readBody(req, MAX_IMAGE_BYTES + 1)
      return send(res, 200, { path: saveImage(db, me.id, project, bytes) })
    }
    const imageMatch = path.match(/^\/api\/images\/([0-9a-f-]{36})$/)
    if (imageMatch && method === 'GET') {
      const img = readImage(db, me.id, imageMatch[1])
      if (!img) throw new AccessError('not found')
      res.writeHead(200, { 'Content-Type': img.type, 'Content-Length': img.bytes.length, 'Cache-Control': 'private, max-age=31536000, immutable' })
      return void res.end(img.bytes)
    }
    if (path === '/api/product-image' && method === 'GET') {
      if (!config.imageFetch) throw new HttpError(503, 'disabled')
      limit(`fetch:${me.id}`, 200, 600_000)
      try {
        const img = await fetchProductImage(url.searchParams.get('url') || '')
        res.writeHead(200, {
          'Content-Type': img.contentType,
          'Cache-Control': 'private, no-store',
          'X-Image-Source': encodeURI(img.source),
          // Checked, size-limited facts (src/shared/product-facts.ts) as base64url JSON.
          'X-Product-Facts': encodeFacts(img.facts),
        })
        return void res.end(img.body)
      } catch (e) {
        const err = e instanceof ImageFetchError ? e : new ImageFetchError('failed', 502)
        // The page may have been read although no picture came of it; its facts still help.
        return send(res, err.status, err.facts ? { error: err.code, facts: err.facts } : { error: err.code })
      }
    }

    throw new HttpError(404, 'not-found')
  }

  return {
    setupLink: () => (setupToken ? `${config.origin}/join?setup=${setupToken}` : null),
    handle(req, res, next) {
      const url = new URL(req.url || '/', 'http://local')
      const path = url.pathname
      // Vite's development server injects an inline script for hot reloading; pages get the
      // strict policy in production only. The API always gets it.
      securityHeaders(res, https, config.production || path.startsWith('/api/') ? CSP : '')
      if (path === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
        return void res.end('ok\n')
      }
      if (!path.startsWith('/api/')) return next()
      route(req, res, path, url).catch((e: unknown) => {
        if (res.headersSent) return void res.end()
        if (e instanceof HttpError) return send(res, e.status, { error: e.message })
        if (e instanceof AccessError) return send(res, e.status, { error: e.status === 404 ? 'not-found' : 'forbidden' })
        // Invalid input from the store's checks: say what, never how the server works.
        if (e instanceof Error && !(e as NodeJS.ErrnoException).code && e.constructor === Error && e.message.length < 200) {
          return send(res, 400, { error: 'invalid', detail: e.message })
        }
        const ref = randomBytes(4).toString('hex')
        console.error(`[error] ref=${ref}`, e)
        send(res, 500, { error: 'internal', ref })
      })
    },
  }
}
