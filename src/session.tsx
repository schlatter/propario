import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setSignedOutHandler } from './api'
import { AppDB, db, dropCache, openCache, useCache } from './db/db'
import type { Settings } from './db/types'
import { applyLocal, pull, setLocalRole, startSync, useTransport } from './sync'
import { report, setStep } from './diagnostics'
import { clearDemo, DEMO_DB, DEMO_USER, demoChanges, demoTransport, endDemo, isDemo, restartIfAsked } from './demo'
import { releaseOf } from './releases'

export interface SessionUser {
  id: string
  name: string
  isAdmin: boolean
  settings: Partial<Settings>
}

type State =
  | { status: 'loading' }
  /** Starting failed (server unreachable, the browser's storage broken …); `ref` is in the server log. */
  | { status: 'failed'; error: unknown; ref: string }
  | { status: 'signed-out'; setupNeeded: boolean }
  | { status: 'signed-in'; user: SessionUser; imageFetch: boolean }

interface SessionApi {
  state: State
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionApi | null>(null)

async function enter(user: SessionUser) {
  setStep('cache')
  const cache = await openCache(user.id)
  // Ratings and "found by" need names; the person's own name is the sensible start.
  const settings = { people: [user.name], lastBackupAt: null, ...user.settings }
  await cache.meta.put({ key: 'settings', value: settings })
  await cache.meta.put({ key: 'me', value: { id: user.id, name: user.name, isAdmin: user.isAdmin } })
  setStep('sync')
  if (!(await cache.meta.get('seq'))) await pull()
  setStep('ready')
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  const refresh = useCallback(async () => {
    if (isDemo()) {
      // The demo never asks the server: its own database, its own invented comparison.
      setStep('cache')
      useTransport(demoTransport)
      await restartIfAsked()
      const demo = new AppDB(DEMO_DB)
      await demo.open()
      useCache(demo)
      await demo.meta.put({ key: 'settings', value: { people: DEMO_USER.settings.people, lastBackupAt: null, seenRelease: releaseOf(__APP_VERSION__) } })
      await demo.meta.put({ key: 'me', value: { id: DEMO_USER.id, name: DEMO_USER.name, isAdmin: false } })
      if (!(await demo.projects.count())) {
        const changes = demoChanges()
        await applyLocal(changes, demo)
        for (const c of changes) if (c.op === 'create' && c.kind === 'projects') await setLocalRole(c.record.id, 'owner', demo)
      }
      setStep('ready')
      setState({ status: 'signed-in', user: DEMO_USER, imageFetch: false })
      return
    }
    clearDemo()
    setStep('session')
    const s = await api<{ user: SessionUser | null; setupNeeded: boolean; imageFetch: boolean }>('/api/session')
    if (!s.user) {
      setState({ status: 'signed-out', setupNeeded: s.setupNeeded })
      return
    }
    await enter(s.user)
    setState({ status: 'signed-in', user: s.user, imageFetch: s.imageFetch })
  }, [])

  const signOut = useCallback(async () => {
    if (isDemo()) return void endDemo()
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    await dropCache()
    setState({ status: 'signed-out', setupNeeded: false })
  }, [])

  useEffect(() => {
    setSignedOutHandler(() => {
      void dropCache().then(() => setState({ status: 'signed-out', setupNeeded: false }))
    })
    // Only the server's "nobody signed in" leads to the sign-in page; anything else is shown as
    // what it is, with a way out (src/ui/StartProblem.tsx).
    refresh().catch((error: unknown) => setState({ status: 'failed', error, ref: report('start-failed', error) }))
  }, [refresh])

  const signedIn = state.status === 'signed-in'
  useEffect(() => (signedIn ? startSync() : undefined), [signedIn])

  return <SessionContext.Provider value={{ state, refresh, signOut }}>{children}</SessionContext.Provider>
}

export function useSession(): SessionApi {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession outside SessionProvider')
  return s
}

/** The signed-in person (only use below the sign-in gate). */
export function useMe(): SessionUser {
  const { state } = useSession()
  if (state.status !== 'signed-in') throw new Error('not signed in')
  return state.user
}

// ---------- passkey ceremonies ----------

export async function register(name: string, grant: { setup?: string; invite?: string }): Promise<string> {
  const { options, challengeId } = await api<{ options: Parameters<typeof startRegistration>[0]['optionsJSON']; challengeId: string }>(
    '/api/auth/register/begin',
    { body: { name, ...grant } },
  )
  const response = await startRegistration({ optionsJSON: options })
  const { recoveryKey } = await api<{ recoveryKey: string }>('/api/auth/register/finish', { body: { challengeId, response } })
  return recoveryKey
}

export async function signInWithPasskey(): Promise<void> {
  const { options, challengeId } = await api<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON']; challengeId: string }>(
    '/api/auth/login/begin',
    { method: 'POST', body: {} },
  )
  const response = await startAuthentication({ optionsJSON: options })
  await api('/api/auth/login/finish', { body: { challengeId, response } })
}

export async function signInWithRecoveryKey(key: string): Promise<string> {
  return (await api<{ recoveryKey: string }>('/api/auth/recover', { body: { key } })).recoveryKey
}

export async function addPasskey(): Promise<void> {
  const { options, challengeId } = await api<{ options: Parameters<typeof startRegistration>[0]['optionsJSON']; challengeId: string }>('/api/passkeys/begin', {
    method: 'POST',
    body: {},
  })
  const response = await startRegistration({ optionsJSON: options })
  await api('/api/passkeys/finish', { body: { challengeId, response } })
}

export { db }
