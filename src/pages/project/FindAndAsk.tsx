import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../api'
import { isDemo } from '../../demo'
import { comparisonForAi, splitAnswer } from '../../domain/ai-export'
import { searchLinks, searchTerm } from '../../domain/lookup'
import { useI18n } from '../../i18n'
import { useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { aiProblem, type AiSettings } from '../AiSettings'
import { QuickAdd } from './QuickAdd'
import { LookupRow } from './SourcesSections'
import type { ProjectData } from './useProjectData'

/**
 * Finding more products and asking about them, always at hand: a button bottom right that opens
 * a small panel. Without AI it searches the shops for what is being compared and takes the
 * link of what was found. With one's own AI it hands over the comparison with a request – more
 * products, or one's own question: copied for the AI one uses elsewhere, or, once connected in
 * Settings (server/ai.ts), sent from here when asked. Either way a table in the answer comes back
 * only through "Add or update products", where every change is seen first.
 */
export function FindAndAsk({ data, canEdit, onOpen }: { data: ProjectData; canEdit: boolean; onOpen: (id: string) => void }) {
  const { m, fmt } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  /** One's own AI, if connected (undefined: not asked yet). */
  const [ai, setAi] = useState<AiSettings | undefined>(isDemo() ? null : undefined)
  /** One's own AI is switched off on this instance (PROPARIO_AI=off). */
  const [aiOff, setAiOff] = useState(false)
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<{ text: string } | { problem: string } | null>(null)
  const [query, setQuery] = useState('')
  const [question, setQuestion] = useState('')
  const toggle = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const id = useId()
  const { project } = data

  const show = () => {
    setQuery(searchTerm(project.name, data.products))
    setOpen(true)
    // Asked each time the panel opens: connecting happens in Settings.
    if (!isDemo())
      api<AiSettings>('/api/me/ai')
        .then(setAi)
        .catch((e) => {
          setAi(null)
          setAiOff(e instanceof ApiError && e.code === 'disabled')
        })
  }
  const hide = () => {
    setOpen(false)
    toggle.current?.focus()
  }
  useEffect(() => {
    if (open) search.current?.focus()
  }, [open])
  // A new answer (or problem) is brought into view at the end of the panel.
  const answerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (answer) answerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [answer])

  const copy = (request: string) =>
    navigator.clipboard
      .writeText(comparisonForAi(data, m, fmt, request))
      .then(() => toast(m.ai.copied))
      .catch(() => toast(m.ai.failed))

  const send = async (request: string, search: boolean) => {
    setAsking(true)
    setAnswer(null)
    try {
      const r = await api<{ answer: string }>('/api/ai/ask', {
        body: { text: comparisonForAi(data, m, fmt, request), search },
        timeoutMs: 240_000,
      })
      setAnswer({ text: r.answer })
    } catch (e) {
      setAnswer({ problem: m.ai.problem[aiProblem(e)] })
    } finally {
      setAsking(false)
    }
  }
  const parts = answer && 'text' in answer ? splitAnswer(answer.text) : null

  return (
    <div className="find-ask">
      {open && (
        <div
          className="find-ask-panel"
          role="dialog"
          aria-labelledby={`${id}-title`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              hide()
            }
          }}
        >
          <div className="find-ask-head">
            <h2 id={`${id}-title`}>{m.ai.open}</h2>
            <button type="button" className="icon-btn" onClick={hide} aria-label={m.common.close} title={m.common.close}>
              <Glyph name="close" />
            </button>
          </div>

          <section aria-labelledby={`${id}-search`}>
            <h3 id={`${id}-search`}>{m.ai.searchTitle}</h3>
            <label className="field">
              <span>{m.ai.searchFor}</span>
              <input ref={search} className="input" type="search" value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <LookupRow links={searchLinks(query)} label={m.lookup.prices} />
            {canEdit && (
              <>
                <p className="muted small">{m.ai.searchHint}</p>
                <QuickAdd
                  data={data}
                  inline
                  onOpen={(pid) => {
                    setOpen(false)
                    onOpen(pid)
                  }}
                />
              </>
            )}
          </section>

          <section aria-labelledby={`${id}-ai`}>
            <h3 id={`${id}-ai`}>{m.ai.withAi}</h3>
            <p className="muted small">{ai ? m.ai.withAiDirect(m.ai.settings.providers[ai.provider]) : m.ai.withAiHint}</p>
            <button
              type="button"
              className={ai ? 'btn primary' : 'btn'}
              disabled={asking}
              onClick={() => void (ai ? send(m.ai.suggestPrompt, true) : copy(m.ai.suggestPrompt))}
            >
              <Glyph name={ai ? 'search' : 'copy'} /> {m.ai.suggest}
            </button>
            <label className="field">
              <span>{m.ai.question}</span>
              <textarea
                className="textarea"
                rows={2}
                value={question}
                maxLength={2000}
                aria-describedby={`${id}-qhint`}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <p id={`${id}-qhint`} className="muted small">
              {m.ai.questionHint}
            </p>
            <div className="row">
              {ai && (
                <button type="button" className="btn primary" disabled={asking} onClick={() => void send(question, false)}>
                  {m.ai.ask}
                </button>
              )}
              <button type="button" className={ai ? 'btn ghost' : 'btn'} onClick={() => void copy(question)}>
                <Glyph name="copy" /> {m.ai.copy}
              </button>
            </div>
            {ai === null && !aiOff && !isDemo() && (
              <p className="small">
                {m.ai.connectHint} <Link to="/settings">{m.ai.settings.title}</Link>
              </p>
            )}
            <div ref={answerRef} aria-live="polite" className="find-ask-answer-wrap">
              {asking && <p className="muted small">{m.ai.asking}</p>}
              {answer && 'problem' in answer && (
                <p className="small pimg-error" role="alert">
                  {answer.problem}
                </p>
              )}
              {parts && (
                <div className="find-ask-answer">
                  <h4>{m.ai.answer}</h4>
                  {parts.prose && <p className="find-ask-text">{parts.prose}</p>}
                  {parts.rows > 0 && <p className="muted small">{m.ai.answerTable(parts.rows)}</p>}
                  {parts.rows > 0 && canEdit && (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => navigate(`/p/${project.id}/merge`, { state: { text: answer && 'text' in answer ? answer.text : '' } })}
                    >
                      <Glyph name="upload" /> {m.merge.menu}
                    </button>
                  )}
                </div>
              )}
            </div>
            {canEdit && !ai && (
              <p className="small">
                {m.ai.pasteBack} <Link to={`/p/${project.id}/merge`}>{m.merge.menu}</Link>
              </p>
            )}
          </section>
        </div>
      )}
      <button
        ref={toggle}
        type="button"
        className="find-ask-toggle"
        aria-expanded={open}
        aria-label={m.ai.open}
        title={m.ai.open}
        onClick={() => (open ? hide() : show())}
      >
        <Glyph name="search" />
        <span className="hide-narrow" aria-hidden="true">
          {m.ai.open}
        </span>
      </button>
    </div>
  )
}
