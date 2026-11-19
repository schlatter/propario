/**
 * What to know when the app breaks or hangs: which start-up step it was in, and a short
 * reference that appears both on screen and in the server log (`[client] ref=…`). Reports carry
 * the error, the step, the version and the page's path – no contents of comparisons.
 */
export type Step = 'session' | 'cache' | 'sync' | 'ready'

let step: Step = 'session'
export const setStep = (s: Step) => void (step = s)
export const currentStep = () => step

/** Sends a report and returns its reference; never throws, never waits. */
export function report(kind: 'crash' | 'stuck' | 'start-failed', error?: unknown): string {
  const ref = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')
  const e = error instanceof Error ? error : null
  try {
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({
        ref,
        kind,
        step,
        version: __APP_VERSION__,
        path: location.pathname,
        message: e ? `${e.name}: ${e.message}` : String(error ?? ''),
        stack: e?.stack ?? '',
      }),
    }).catch(() => {})
  } catch {
    // reporting must never make things worse
  }
  return ref
}

/** Plain text of an error for the screen. */
export const errorText = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? ''))
