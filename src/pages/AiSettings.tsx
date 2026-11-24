import { useEffect, useId, useState } from 'react'
import { api, ApiError } from '../api'
import { saveSettings } from '../db/db'
import { isDemo } from '../demo'
import { useSettings } from '../hooks'
import { useConfirm } from '../ui/Dialog'
import { useI18n } from '../i18n'
import { Glyph } from '../ui/Glyph'

export type Provider = 'anthropic' | 'openai'
export type AiSettings = { provider: Provider; model: string; keyHint: string } | null
type Problem = 'key' | 'model' | 'credit' | 'rate' | 'busy' | 'request' | 'limit' | 'often' | 'refused' | 'unreachable'

const KEY_PAGES: Record<Provider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
}

const PROBLEMS: Problem[] = ['key', 'model', 'credit', 'rate', 'busy', 'request', 'limit', 'refused', 'unreachable']

/** What went wrong, from an error of the server's AI routes. */
export function aiProblem(e: unknown): Problem {
  if (!(e instanceof ApiError)) return 'unreachable'
  if (PROBLEMS.includes(e.reason as Problem)) return e.reason as Problem
  // Propario's own brake on asking, not the provider's limit.
  return e.code === 'rate-limited' ? 'often' : 'unreachable'
}

/**
 * The message for a failed request to one's own AI: what it means and what to do; for the cases
 * it cannot name, also what the provider said.
 */
export function aiMessage(e: unknown, problems: Record<Problem, string>): string {
  const problem = aiProblem(e)
  const detail = e instanceof ApiError ? e.detail : ''
  return detail && ['request', 'limit', 'unreachable'].includes(problem) ? `${problems[problem]} (${detail})` : problems[problem]
}

/**
 * Settings → Your AI (server/ai.ts): first whether to ask one's own AI from Propario at all – off
 * unless switched on; copying for one's AI works either way. On: connect Claude or ChatGPT with an
 * API key, choose the model, remove it. Off again forgets the key. The key goes to the server once
 * and never comes back; the demo has no server and so no AI of its own.
 */
export function AiSection() {
  const { m } = useI18n()
  const t = m.ai.settings
  const id = useId()
  const [current, setCurrent] = useState<AiSettings | undefined>(undefined)
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [key, setKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const on = useSettings().useAi === true
  const confirm = useConfirm()

  useEffect(() => {
    if (isDemo()) return
    api<AiSettings>('/api/me/ai')
      .then(setCurrent)
      // Switched off on this instance (PROPARIO_AI=off): no section at all.
      .catch((e) => setCurrent(e instanceof ApiError && e.code === 'disabled' ? undefined : null))
  }, [])
  useEffect(() => {
    if (!current) return setModels([])
    api<string[]>('/api/me/ai/models', { timeoutMs: 60_000 })
      .then(setModels)
      .catch(() => setModels([]))
  }, [current?.provider, current?.keyHint])

  if (isDemo() || current === undefined) return null

  const save = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      setCurrent(await api<AiSettings>('/api/me/ai', { method: 'PUT', body, timeoutMs: 60_000 }))
      setKey('')
    } catch (e) {
      setError(aiMessage(e, m.ai.problem))
    } finally {
      setBusy(false)
    }
  }

  const switchTo = async (next: boolean) => {
    if (next === on) return
    if (!next && current && !(await confirm({ title: t.offTitle, text: t.offConfirm, confirmLabel: t.off, danger: true }))) return
    await saveSettings({ useAi: next })
    // The server forgets the key when switched off.
    if (!next) setCurrent(null)
  }

  return (
    <section className="panel stack" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t.title}</h2>
      <div className="seg" role="group" aria-label={t.use}>
        <button type="button" aria-pressed={!on} onClick={() => void switchTo(false)}>
          {t.off}
        </button>
        <button type="button" aria-pressed={on} onClick={() => void switchTo(true)}>
          {t.on}
        </button>
      </div>
      <p className="muted small">{on ? t.hint : t.offHint}</p>
      {on && <p className="small ai-subscription">{t.subscription}</p>}
      {!on ? null : current ? (
        <>
          <p>{t.connected(t.providers[current.provider], current.keyHint)}</p>
          <div className="row ai-model">
            <label className="field">
              <span>{t.model}</span>
              <select
                className="select"
                value={current.model}
                disabled={busy}
                onChange={(e) => void save({ provider: current.provider, model: e.target.value })}
              >
                {[...new Set([current.model, ...models])].filter(Boolean).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={async () => {
                await api('/api/me/ai', { method: 'DELETE' })
                setCurrent(null)
              }}
            >
              <Glyph name="trash" /> {t.remove}
            </button>
          </div>
        </>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (key.trim()) void save({ provider, key: key.trim() })
          }}
        >
          <div className="seg" role="group" aria-label={t.provider}>
            {(['anthropic', 'openai'] as Provider[]).map((p) => (
              <button type="button" key={p} aria-pressed={provider === p} onClick={() => setProvider(p)}>
                {t.providers[p]}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t.key}</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              maxLength={300}
              aria-describedby={`${id}-get`}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <p id={`${id}-get`} className="small">
            <a href={KEY_PAGES[provider]} target="_blank" rel="noopener noreferrer">
              {t.getKey}: {t.providers[provider]} <Glyph name="out" />
            </a>
          </p>
          {error && (
            <p className="small pimg-error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="submit" className="btn primary" disabled={busy || !key.trim()}>
              {t.connect}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
