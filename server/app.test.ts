// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { useTransport } from './ai.ts'
import { openDatabase, type DB } from './db.ts'
import { loadConfig } from './env.ts'
import { useKey } from './crypto.ts'
import { resetRateLimits } from './ratelimit.ts'
import { consumeInvite, createInvite, createSession, createUser, saveSettings, inviteValid, sessionUser, SESSION_IDLE_MS, useRecoveryKey } from './users.ts'
import { registrationGrant } from './webauthn.ts'
import { newId } from '../src/shared/ids.ts'

let db: DB
let server: http.Server
let base = ''
/** Extra settings for the next requests (the app is made per request). */
let env: Record<string, string> = {}

async function start() {
  server = http.createServer((req, res) => {
    const app = createApp(db, loadConfig({ NODE_ENV: 'production', DATA_KEY: 'unused-in-tests', ORIGIN: base || 'http://localhost:1', ...env }))
    app.handle(req, res, () => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('static')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://localhost:${(server.address() as AddressInfo).port}`
}

beforeEach(async () => {
  env = {}
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
      // The page never gets the camera; WebXR (the room view) only for this origin.
      expect(res.headers.get('permissions-policy')).toContain('camera=()')
      expect(res.headers.get('permissions-policy')).toContain('xr-spatial-tracking=(self)')
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

  it('with a request target no URL parser accepts get 400, and the server keeps running', async () => {
    // `//`, `//:99999` and `//[` start with "/", so Node accepts them, but `new URL` throws on them.
    for (const target of ['//', '//:99999', '//[']) {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(base, { path: target }, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
        req.on('error', reject)
        req.end()
      })
      expect(status, target).toBe(400)
    }
    expect((await api('/healthz')).status).toBe(200)
  })

  it('without a session or for small requests accept only small bodies; changes may be large', async () => {
    // A recovery key is a few dozen bytes; 300 kB from anyone on the network is refused unread.
    const big = 'x'.repeat(300 * 1024)
    // The server stops reading at the limit and closes the connection, so the 413 may not arrive.
    const refused = await post('/api/auth/recover', { key: big }).then(
      (r) => r.status,
      () => 'closed',
    )
    expect([413, 'closed']).toContain(refused)
    const id = newId()
    createUser(db, { id, name: 'Ada', isAdmin: true })
    const cookie = `propario=${createSession(db, id)}`
    // Read whole and checked: the answer is about the (empty) list, not about the size.
    const changes = await post('/api/changes', { changes: [], note: big }, { cookie })
    expect(await changes.json()).toMatchObject({ error: 'invalid', detail: expect.stringContaining('non-empty list') })
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

describe('error reports from the browser', () => {
  it('writes one sanitised line to the log, from the same origin only, and not without limit', async () => {
    const lines: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => void lines.push(args.join(' '))
    try {
      const report = {
        ref: 'a1b2c3d4',
        kind: 'stuck',
        step: 'cache',
        version: '0.9.2+abc',
        path: '/p/x?product=y',
        message: 'hangs\n[error] fake',
        stack: 'at open (db.ts:1)',
      }
      expect((await post('/api/client-error', report)).status).toBe(200)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain('[client] ref=a1b2c3d4 user=- kind=stuck step=cache version=0.9.2+abc path=/p/x ')
      // A line break cannot start a fake log line.
      expect(lines[0]).not.toContain('\n')
      expect(lines[0]).toContain('message="hangs [error] fake"')
      expect(lines[0]).not.toContain(' log=')
      // With the detailed log on, the last lines come along – also on one line.
      await post('/api/client-error', { ...report, log: '10:00:01 request GET /api/sync 200 80 ms\n| x' })
      expect(lines[1]).toContain('log="10:00:01 request GET /api/sync 200 80 ms | x"')
      expect((await post('/api/client-error', report, { origin: 'https://evil.example' })).status).toBe(403)
      for (let i = 0; i < 18; i++) await post('/api/client-error', report)
      expect((await post('/api/client-error', report)).status).toBe(429)
    } finally {
      console.error = original
    }
  })
})

describe('resetting a browser', () => {
  it('lets the browser clear its cached files and stored data, but never the sign-in', async () => {
    const res = await api('/api/reset-browser', { redirect: 'manual' })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/reset.html?done=1')
    expect(res.headers.get('clear-site-data')).toBe('"cache", "storage"')
    expect(res.headers.get('clear-site-data')).not.toContain('cookies')
  })
})

describe('one’s own AI', () => {
  const key = 'fake-secret-key-' + 'x'.repeat(12)
  const models = () =>
    useTransport((async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('/v1/models')) return Response.json({ data: [{ id: 'claude-opus-5-5', type: 'model' }], has_more: false })
      return Response.json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, { status: 401 })
    }) as typeof fetch)
  afterEach(() => useTransport(null))
  const send = (method: string, path: string, body: unknown, cookie: string) =>
    api(path, { method, headers: { 'content-type': 'application/json', origin: base, cookie }, body: JSON.stringify(body) })

  it('keeps the key sealed with the account and never shows it, not even to its owner', async () => {
    useKey(Buffer.alloc(32, 7).toString('base64'))
    models()
    const ada = newId()
    const grace = newId()
    createUser(db, { id: ada, name: 'Ada', isAdmin: true })
    createUser(db, { id: grace, name: 'Grace', isAdmin: false })
    saveSettings(db, ada, { useAi: true })
    const cookie = `propario=${createSession(db, ada)}`
    const res = await send('PUT', '/api/me/ai', { provider: 'anthropic', key }, cookie)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5', keyHint: 'xxxx' })
    const stored = (db.prepare('SELECT ai FROM users WHERE id = ?').get(ada) as { ai: string }).ai
    expect(stored).toMatch(/^v1\./)
    expect(stored).not.toContain('secret')
    for (const path of ['/api/me/ai', '/api/session']) expect(await (await api(path, { headers: { cookie } })).text()).not.toContain('secret')
    // Someone else sees no AI of theirs – and has none.
    expect(await (await api('/api/me/ai', { headers: { cookie: `propario=${createSession(db, grace)}` } })).json()).toBeNull()
    // Removed on request.
    expect((await send('DELETE', '/api/me/ai', {}, cookie)).status).toBe(200)
    expect(await (await api('/api/me/ai', { headers: { cookie } })).json()).toBeNull()
  })

  it('refuses a key the provider refuses, and asks nothing without an AI', async () => {
    models()
    const ada = newId()
    createUser(db, { id: ada, name: 'Ada', isAdmin: true })
    saveSettings(db, ada, { useAi: true })
    const cookie = `propario=${createSession(db, ada)}`
    useTransport((async () => Response.json({ type: 'error', error: { type: 'authentication_error', message: 'no' } }, { status: 401 })) as typeof fetch)
    const res = await send('PUT', '/api/me/ai', { provider: 'anthropic', key }, cookie)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'ai', reason: 'key' })
    expect(await (await api('/api/me/ai', { headers: { cookie } })).json()).toBeNull()
    expect((await send('POST', '/api/ai/ask', { text: 'Which one?' }, cookie)).status).toBe(400)
    expect((await send('PUT', '/api/me/ai', { provider: 'other', key }, cookie)).status).toBe(400)
  })
  it('stays off until its person switches it on, and switching off forgets the key', async () => {
    models()
    const ada = newId()
    createUser(db, { id: ada, name: 'Ada', isAdmin: true })
    const cookie = `propario=${createSession(db, ada)}`
    // Off by default: no key is taken, nothing is asked.
    expect((await send('PUT', '/api/me/ai', { provider: 'anthropic', key }, cookie)).status).toBe(403)
    expect((await send('POST', '/api/ai/ask', { text: 'Which one?' }, cookie)).status).toBe(403)
    expect((await send('PATCH', '/api/me', { settings: { useAi: true } }, cookie)).status).toBe(200)
    expect((await send('PUT', '/api/me/ai', { provider: 'anthropic', key }, cookie)).status).toBe(200)
    expect(await (await api('/api/me/ai', { headers: { cookie } })).json()).toMatchObject({ provider: 'anthropic' })
    expect((await send('PATCH', '/api/me', { settings: { useAi: false } }, cookie)).status).toBe(200)
    expect(await (await api('/api/me/ai', { headers: { cookie } })).json()).toBeNull()
    expect((await send('POST', '/api/ai/ask', { text: 'Which one?' }, cookie)).status).toBe(403)
  })

  it('is gone when the instance switches it off', async () => {
    env = { PROPARIO_AI: 'off' }
    const ada = newId()
    createUser(db, { id: ada, name: 'Ada', isAdmin: true })
    const cookie = `propario=${createSession(db, ada)}`
    expect((await api('/api/me/ai', { headers: { cookie } })).status).toBe(404)
    expect((await send('PUT', '/api/me/ai', { provider: 'anthropic', key }, cookie)).status).toBe(404)
    expect((await send('POST', '/api/ai/ask', { text: 'Which one?' }, cookie)).status).toBe(404)
  })
})
