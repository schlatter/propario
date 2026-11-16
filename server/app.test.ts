// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { openDatabase, type DB } from './db.ts'
import { loadConfig } from './env.ts'
import { useKey } from './crypto.ts'
import { resetRateLimits } from './ratelimit.ts'
import { consumeInvite, createInvite, createSession, createUser, inviteValid, sessionUser, SESSION_IDLE_MS, useRecoveryKey } from './users.ts'
import { registrationGrant } from './webauthn.ts'
import { newId } from '../src/shared/ids.ts'

let db: DB
let server: http.Server
let base = ''

async function start() {
  server = http.createServer((req, res) => {
    const app = createApp(db, loadConfig({ NODE_ENV: 'production', DATA_KEY: 'unused-in-tests', ORIGIN: base || 'http://localhost:1' }))
    app.handle(req, res, () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('static')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://localhost:${(server.address() as AddressInfo).port}`
}

beforeEach(async () => {
  useKey(null)
  resetRateLimits()
  db = openDatabase(':memory:')
  await start()
})
afterEach(() => new Promise<void>((r) => server.close(() => r())))

const api = (path: string, init: RequestInit = {}) => fetch(base + path, init)
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  api(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...headers }, body: JSON.stringify(body) })

describe('every response', () => {
  it('carries the security headers, including errors and static files', async () => {
    for (const res of [await api('/api/sync'), await api('/'), await api('/healthz')]) {
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
      expect(res.headers.get('content-security-policy')).toContain("script-src 'self'")
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin')
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    }
  })
  it('never caches API answers', async () => {
    expect((await api('/api/session')).headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('requests', () => {
  it('need a session for data', async () => {
    for (const path of ['/api/sync', '/api/users', '/api/invites', '/api/product-image?url=https://example.org']) {
      const res = await api(path)
      expect(res.status, path).toBe(401)
    }
  })

  it('that change something must come from this origin (CSRF)', async () => {
    expect((await post('/api/changes', { changes: [] }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await api('/api/changes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(403)
    expect((await post('/api/changes', { changes: [] }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post('/api/changes', { changes: [] })).status).toBe(401) // right origin, but signed out
  })

  it('with a session cookie reach the data; a bad cookie does not', async () => {
    const id = newId()
    createUser(db, { id, name: 'Ada', isAdmin: true })
    const token = createSession(db, id)
    const ok = await api('/api/sync', { headers: { cookie: `propario=${token}` } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ projects: [], records: [] })
    expect((await api('/api/sync', { headers: { cookie: 'propario=forged' } })).status).toBe(401)
  })

  it('show no internals on errors', async () => {
    const id = newId()
    createUser(db, { id, name: 'Ada', isAdmin: true })
    const cookie = `propario=${createSession(db, id)}`
    const res = await post('/api/changes', { changes: [{ op: 'patch', kind: 'products', id: 'x', projectId: 'y', patch: {} }] }, { cookie })
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).not.toMatch(/at \w+ \(|node_modules|sqlite/i)
  })

  it('only admins invite', async () => {
    const id = newId()
    createUser(db, { id, name: 'Grace', isAdmin: false })
    expect((await post('/api/invites', { label: 'x' }, { cookie: `propario=${createSession(db, id)}` })).status).toBe(403)
  })

  it('reports the running version, so open pages notice an update', async () => {
    const app = createApp(db, loadConfig({ NODE_ENV: 'production', DATA_KEY: 'unused-in-tests', ORIGIN: base }), '0.2.0+abc1234')
    const res = await new Promise<string>((resolve) => {
      const fake = { setHeader() {}, writeHead() {}, end: (body: string) => resolve(body), headersSent: false }
      app.handle({ url: '/api/session', method: 'GET', headers: {}, socket: {} } as never, fake as never, () => {})
    })
    expect(JSON.parse(res)).toMatchObject({ version: '0.2.0+abc1234' })
  })

  it('reports the setup link only while there is no account', async () => {
    expect(await (await api('/api/session')).json()).toMatchObject({ user: null, setupNeeded: true })
  })
})

describe('accounts', () => {
  it('the first account needs the setup secret and becomes admin; later ones need an invitation', () => {
    expect(registrationGrant(db, 'secret', {})).toEqual({ allowed: false, isAdmin: false })
    expect(registrationGrant(db, 'secret', { setup: 'wrong' })).toEqual({ allowed: false, isAdmin: false })
    expect(registrationGrant(db, 'secret', { setup: 'secret' })).toEqual({ allowed: true, isAdmin: true })
    const ada = newId()
    createUser(db, { id: ada, name: 'Ada', isAdmin: true })
    expect(registrationGrant(db, 'secret', { setup: 'secret' }).allowed).toBe(false)
    const { token } = createInvite(db, ada, 'Grace')
    expect(registrationGrant(db, null, { invite: token })).toEqual({ allowed: true, isAdmin: false })
  })

  it('invitations work once and expire after 14 days', () => {
    const ada = newId()
    createUser(db, { id: ada, name: 'Ada', isAdmin: true })
    const { token } = createInvite(db, ada, '')
    expect(consumeInvite(db, token)).toBe(true)
    expect(consumeInvite(db, token)).toBe(false)
    const late = createInvite(db, ada, '', Date.now() - 15 * 24 * 3600_000)
    expect(inviteValid(db, late.token)).toBe(false)
    const raw = db.prepare('SELECT hash FROM invites').all() as { hash: string }[]
    expect(raw.some((r) => r.hash === token)).toBe(false) // stored as a hash only
  })

  it('a recovery key works exactly once and is replaced', () => {
    const ada = newId()
    const { recoveryKey } = createUser(db, { id: ada, name: 'Ada', isAdmin: true })
    const used = useRecoveryKey(db, recoveryKey.toLowerCase().replace(/-/g, ' '))
    expect(used?.userId).toBe(ada)
    expect(useRecoveryKey(db, recoveryKey)).toBeNull()
    expect(useRecoveryKey(db, used!.recoveryKey)?.userId).toBe(ada)
  })

  it('sessions end after 30 idle days and are stored as hashes', () => {
    const ada = newId()
    createUser(db, { id: ada, name: 'Ada', isAdmin: true })
    const t0 = Date.now()
    const token = createSession(db, ada, t0)
    expect(sessionUser(db, token, t0 + 1000)?.id).toBe(ada)
    expect(sessionUser(db, token, t0 + SESSION_IDLE_MS + 1000)).toBeNull()
    expect(db.prepare('SELECT count(*) AS n FROM sessions WHERE hash = ?').get(token)).toEqual({ n: 0 })
  })
})

describe('configuration', () => {
  it('refuses to run in production without a data key or with plain http', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', ORIGIN: 'https://p.example.org' })).toThrow('DATA_KEY')
    expect(() => loadConfig({ NODE_ENV: 'production', ORIGIN: 'http://p.example.org', DATA_KEY: 'x' })).toThrow('https')
    expect(loadConfig({ NODE_ENV: 'production', ORIGIN: 'https://p.example.org/', DATA_KEY: 'x' }).origin).toBe('https://p.example.org')
  })
})
