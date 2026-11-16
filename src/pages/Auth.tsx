import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api'
import { useI18n } from '../i18n'
import { Field } from '../ui/inputs'
import { register, signInWithPasskey, signInWithRecoveryKey, useSession } from '../session'

/** Turns a failed ceremony into a sentence. */
function useAuthError() {
  const { m } = useI18n()
  return (e: unknown): string => {
    const errors = m.auth.errors as Record<string, string>
    if (e instanceof ApiError) return errors[e.code] ?? m.auth.errors.generic
    const name = (e as Error)?.name
    if (name === 'NotAllowedError' || name === 'AbortError') return m.auth.errors.cancelled
    if (name === 'NotSupportedError' || name === 'SecurityError' || !window.isSecureContext) return m.auth.errors.unsupported
    return m.auth.errors.generic
  }
}

function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className="auth">
      <div className="auth-card stack">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  )
}

/** Shows a recovery key once, then continues. */
export function RecoveryKeyNotice({ recoveryKey, text, onDone }: { recoveryKey: string; text: string; onDone: () => void }) {
  const { m } = useI18n()
  return (
    <div className="stack">
      <p>{text}</p>
      <output className="recovery-key" aria-label={m.auth.recoveryTitle}>
        {recoveryKey}
      </output>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => void navigator.clipboard?.writeText(recoveryKey)}>
          {m.members.copy}
        </button>
        <button type="button" className="btn primary" onClick={onDone} autoFocus>
          {m.auth.recoverySaved}
        </button>
      </div>
    </div>
  )
}

export function SignInPage({ setupNeeded }: { setupNeeded: boolean }) {
  const { m } = useI18n()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const toMessage = useAuthError()
  const [mode, setMode] = useState<'passkey' | 'recovery'>('passkey')
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)

  const attempt = async (job: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await job()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (newKey) {
    return (
      <AuthFrame title={m.auth.recoveryTitle}>
        <RecoveryKeyNotice
          recoveryKey={newKey}
          text={m.auth.recoveryAfterUse}
          onDone={async () => {
            await refresh()
            navigate('/settings', { replace: true })
          }}
        />
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title={m.auth.signInTitle}>
      {setupNeeded ? (
        <p role="status">{m.auth.setupMissing}</p>
      ) : mode === 'passkey' ? (
        <>
          <p className="muted">{m.auth.signInText}</p>
          <button
            type="button"
            className="btn primary big"
            disabled={busy}
            onClick={() =>
              attempt(async () => {
                await signInWithPasskey()
                await refresh()
              })
            }
          >
            {m.auth.signIn}
          </button>
          <button type="button" className="link-btn" onClick={() => setMode('recovery')}>
            {m.auth.useRecovery}
          </button>
        </>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            void attempt(async () => setNewKey(await signInWithRecoveryKey(key)))
          }}
        >
          <Field label={m.auth.recoveryLabel}>
            <input className="input mono" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} required />
          </Field>
          <button type="submit" className="btn primary" disabled={busy || !key.trim()}>
            {m.auth.recoverySubmit}
          </button>
          <button type="button" className="link-btn" onClick={() => setMode('passkey')}>
            {m.auth.backToPasskey}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </AuthFrame>
  )
}

export function JoinPage() {
  const { m } = useI18n()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const toMessage = useAuthError()
  const [params] = useSearchParams()
  const setup = params.get('setup') ?? undefined
  const invite = params.get('invite') ?? undefined
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)

  if (recoveryKey) {
    return (
      <AuthFrame title={m.auth.recoveryTitle}>
        <RecoveryKeyNotice
          recoveryKey={recoveryKey}
          text={m.auth.recoveryText}
          onDone={async () => {
            await refresh()
            navigate('/', { replace: true })
          }}
        />
      </AuthFrame>
    )
  }

  return (
    <AuthFrame title={m.auth.joinTitle}>
      {!setup && !invite ? (
        <p role="status">{m.auth.joinNoGrant}</p>
      ) : (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            try {
              setRecoveryKey(await register(name.trim(), { setup, invite }))
            } catch (err) {
              setError(toMessage(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          <p className="muted">{setup ? m.auth.joinSetup : m.auth.joinInvite}</p>
          <Field label={m.auth.yourName}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="nickname" required autoFocus />
          </Field>
          <button type="submit" className="btn primary big" disabled={busy || !name.trim()}>
            {m.auth.createPasskey}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </AuthFrame>
  )
}
