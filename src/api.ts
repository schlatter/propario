/** Talking to the Propario server: same origin, JSON, session cookie. */
import { debugLog } from './debug'
import { isDemo } from './demo'

export class ApiError extends Error {
  status: number
  code: string
  /** Why, when the server says more (e.g. what one's own AI answered: server/ai.ts). */
  reason: string
  /** The server's own words for it, e.g. what a provider answered. */
  detail: string
  constructor(status: number, code: string, reason = '', detail = '') {
    super(code)
    this.status = status
    this.code = code
    this.reason = reason
    this.detail = detail
  }
}

/** Called when the server says the session is gone (set by the session provider). */
let onSignedOut: () => void = () => {}
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; raw?: Blob; timeoutMs?: number } = {}): Promise<T> {
  // The demo talks to no server (src/demo.ts): what needs one says so instead.
  if (isDemo()) throw new ApiError(0, 'demo')
  const headers: Record<string, string> = {}
  let body: BodyInit | undefined
  if (init.raw) {
    body = init.raw
    headers['Content-Type'] = init.raw.type || 'application/octet-stream'
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body)
    headers['Content-Type'] = 'application/json'
  }
  let res: Response
  const method = init.method ?? (body ? 'POST' : 'GET')
  // Logged by method and path only (src/debug.ts): never contents.
  const what = `${method} ${path.split('?')[0]}`
  const started = performance.now()
  try {
    // A request that never ends must not freeze the app: after this long it counts as offline.
    const signal = AbortSignal.timeout(init.timeoutMs ?? (init.raw ? 120_000 : 30_000))
    res = await fetch(path, { method, headers, body, credentials: 'same-origin', signal })
  } catch (e) {
    debugLog('request', `${what} failed after ${Math.round(performance.now() - started)} ms: ${(e as Error).name}`)
    throw new ApiError(0, 'offline')
  }
  debugLog('request', `${what} ${res.status} ${Math.round(performance.now() - started)} ms`)
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => ({})) : {}
  if (!res.ok) {
    const code = (data as { error?: string }).error ?? `http-${res.status}`
    if (res.status === 401 && code === 'signed-out') onSignedOut()
    const { reason, detail } = data as { reason?: unknown; detail?: unknown }
    throw new ApiError(res.status, code, String(reason ?? ''), typeof detail === 'string' ? detail : '')
  }
  return data as T
}
