/** Talking to the Propario server: same origin, JSON, session cookie. */

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

/** Called when the server says the session is gone (set by the session provider). */
let onSignedOut: () => void = () => {}
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; raw?: Blob } = {}): Promise<T> {
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
  try {
    // A request that never ends must not freeze the app: after this long it counts as offline.
    const signal = AbortSignal.timeout(init.raw ? 120_000 : 30_000)
    res = await fetch(path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, credentials: 'same-origin', signal })
  } catch {
    throw new ApiError(0, 'offline')
  }
  const data = (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => ({})) : {}
  if (!res.ok) {
    const code = (data as { error?: string }).error ?? `http-${res.status}`
    if (res.status === 401 && code === 'signed-out') onSignedOut()
    throw new ApiError(res.status, code)
  }
  return data as T
}
