/**
 * Starting shows nothing for a moment (it is usually instant). When it hangs or fails, the
 * person sees which step it was, a reference that is also in the server log, and two ways out:
 * reload, or reset this browser's copy of Propario (/reset.html) – the sign-in and all data on
 * the server stay.
 */
import { useEffect, useState } from 'react'
import { currentStep, errorText, report, type Step } from '../diagnostics'
import { useI18n } from '../i18n'

/** How long starting may take before it counts as stuck. */
export const STUCK_AFTER = 10_000

export function Starting() {
  const [stuck, setStuck] = useState<{ step: Step; ref: string } | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setStuck({ step: currentStep(), ref: report('stuck', `still at ${currentStep()}`) }), STUCK_AFTER)
    return () => clearTimeout(t)
  }, [])
  if (!stuck) return <main id="main" aria-busy="true" />
  return <StartProblem step={stuck.step} refId={stuck.ref} />
}

export function StartProblem({ step, refId, error }: { step: Step; refId: string; error?: unknown }) {
  const { m } = useI18n()
  const offline = error instanceof Error && error.message === 'offline'
  return (
    <main id="main" className="crash" role="alert">
      <img src="/favicon.svg" alt="" width={56} height={56} />
      <h1>{offline ? m.start.offlineTitle : error ? m.start.failedTitle : m.start.stuckTitle}</h1>
      <p>{offline ? m.start.offline : m.start.at(m.start.step[step])}</p>
      <div className="row crash-actions">
        <button type="button" className="btn primary" onClick={() => location.reload()}>
          {m.start.reload}
        </button>
        <a className="btn" href="/reset.html">
          {m.start.reset}
        </a>
      </div>
      <p className="muted small">{m.start.resetHint}</p>
      <details className="crash-details">
        <summary>{m.start.details}</summary>
        <p className="small">
          {m.start.reference}: <code>{refId}</code> · {__APP_VERSION__}
        </p>
        {error !== undefined && <pre className="small">{errorText(error)}</pre>}
      </details>
    </main>
  )
}
