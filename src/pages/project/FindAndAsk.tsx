import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../api'
import { isDemo } from '../../demo'
import { useSettings } from '../../hooks'
import { comparisonForAi, splitAnswer } from '../../domain/ai-export'
import { searchLinks, searchTerm, type LookupLink } from '../../domain/lookup'
import { parseNumber } from '../../domain/values'
import { useI18n } from '../../i18n'
import { useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { aiMessage, type AiSettings } from '../AiSettings'
import { QuickAdd } from './QuickAdd'
import { TakeAnswer } from './TakeAnswer'
import { InfoTip } from '../../ui/InfoTip'
import type { ProjectData } from './useProjectData'
import { AI_CHATS, copyForChat, readChat, saveChat, type Chat } from './ai-chat'

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
  /** Asking one's own AI from here is switched on (Settings → Your AI); copying works regardless. */
  const useAi = useSettings().useAi === true
  const [open, setOpen] = useState(false)
  /** One's own AI, if connected (undefined: not asked yet). */
  const [ai, setAi] = useState<AiSettings | undefined>(isDemo() ? null : undefined)
  /** One's own AI is switched off on this instance (PROPARIO_AI=off). */
  const [aiOff, setAiOff] = useState(false)
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<{ text: string } | { problem: string } | null>(null)
  const [query, setQuery] = useState('')
  /** Most a find may cost, as typed (starts at the budget); empty: no limit. */
  const [maxPrice, setMaxPrice] = useState('')
  const [question, setQuestion] = useState('')
  /** An answer pasted back from the AI one uses elsewhere. */
  const [pasted, setPasted] = useState('')
  const [chat, setChat] = useState<Chat>(readChat)
  /** Which half of the panel shows: searching the shops, or asking one's AI. */
  const [tab, setTab] = useState<'search' | 'ai'>('search')
  const toggle = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  /** What takes the focus on the AI tab: the chat to open, or – connected – the question. */
  const firstAi = useRef<HTMLSelectElement>(null)
  const questionBox = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const { project } = data

  const show = () => {
    setQuery(searchTerm(project.name, data.products))
    setMaxPrice(project.budget ? String(project.budget) : '')
    setOpen(true)
    // Asked each time the panel opens: switching on and connecting happen in Settings.
    if (!useAi) setAi(null)
    else if (!isDemo())
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
    if (!open) return
    if (tab === 'search') search.current?.focus()
    else (firstAi.current ?? questionBox.current)?.focus()
  }, [open])
  // A new answer (or problem) is brought into view at the end of the panel.
  const answerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (answer) answerRef.current?.scrollIntoView({ block: 'nearest' })
  }, [answer])

  const copy = (request: string) => copyForChat(comparisonForAi(data, m, fmt, request), chat, m, toast)

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
      setAnswer({ problem: aiMessage(e, m.ai.problem) })
    } finally {
      setAsking(false)
    }
  }
  const parts = answer && 'text' in answer ? splitAnswer(answer.text) : null
  const links = searchLinks(query, parseNumber(maxPrice))

  const tabs = [
    { key: 'search' as const, label: m.ai.tabSearch },
    { key: 'ai' as const, label: m.ai.tabAi },
  ]

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
            <div className="seg find-ask-tabs" role="tablist" aria-label={m.ai.open}>
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${t.key}`}
                  aria-controls={`${id}-panel-${t.key}`}
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button type="button" className="icon-btn" onClick={hide} aria-label={m.common.close} title={m.common.close}>
              <Glyph name="close" />
            </button>
          </div>

          {tab === 'search' && (
            <section role="tabpanel" id={`${id}-panel-search`} aria-labelledby={`${id}-tab-search`}>
              <div className="search-fields">
                <label className="field">
                  <span>{m.ai.searchFor}</span>
                  <input ref={search} className="input" type="search" value={query} maxLength={200} onChange={(e) => setQuery(e.target.value)} />
                </label>
                <label className="field max-price">
                  <span>
                    {m.ai.maxPrice} <InfoTip text={m.ai.maxPriceHint} id={`${id}-maxhint`} inLabel />
                  </span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={maxPrice}
                    maxLength={9}
                    aria-describedby={`${id}-maxhint`}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  />
                </label>
              </div>
              <ChipLinks label={m.lookup.shops} links={links.shops} />
              <ChipLinks label={m.lookup.usedAndDeals} links={links.more} />
              {canEdit && (
                <QuickAdd
                  data={data}
                  inline
                  onOpen={(pid) => {
                    setOpen(false)
                    onOpen(pid)
                  }}
                />
              )}
            </section>
          )}

          {tab === 'ai' && (
            <section role="tabpanel" id={`${id}-panel-ai`} aria-labelledby={`${id}-tab-ai`}>
              {ai ? (
                <p className="muted small">{m.ai.withAiDirect(m.ai.settings.providers[ai.provider])}</p>
              ) : (
                <div className="row open-in">
                  <label className="open-in-label">
                    <span className="small muted">{m.ai.openIn}</span>
                    <select
                      ref={firstAi}
                      className="select"
                      value={chat}
                      onChange={(e) => {
                        setChat(e.target.value as Chat)
                        saveChat(e.target.value as Chat)
                      }}
                    >
                      {AI_CHATS.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                      <option value="">{m.ai.openNothing}</option>
                    </select>
                  </label>
                  <InfoTip text={m.ai.withAiHint} />
                </div>
              )}
              <label className="field">
                <span>{m.ai.question}</span>
                <textarea ref={questionBox} className="textarea" rows={2} value={question} maxLength={2000} onChange={(e) => setQuestion(e.target.value)} />
              </label>
              {/* Two different requests: the question above, or up to five new products. */}
              <div className="row find-ask-actions">
                {ai ? (
                  <>
                    <button type="button" className="btn primary" disabled={asking} onClick={() => void send(question, false)}>
                      {m.ai.ask}
                    </button>
                    <button type="button" className="btn primary" disabled={asking} onClick={() => void send(m.ai.suggestPrompt, true)}>
                      <Glyph name="search" /> {m.ai.findNew}
                    </button>
                    {/* Copying stays: for another AI, or when the API account has no credit. */}
                    <button type="button" className="icon-btn" aria-label={m.ai.copy} title={m.ai.copy} onClick={() => void copy(question)}>
                      <Glyph name="copy" />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn" onClick={() => void copy(question)}>
                      <Glyph name="copy" /> {m.ai.copy}
                    </button>
                    <button type="button" className="btn" onClick={() => void copy(m.ai.suggestPrompt)}>
                      <Glyph name="copy" /> {m.ai.suggest}
                    </button>
                  </>
                )}
              </div>
              {ai === null && useAi && !aiOff && !isDemo() && (
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
                {parts && answer && 'text' in answer && (
                  <div className="find-ask-answer">
                    <h3>{m.ai.answer}</h3>
                    {parts.prose && <p className="find-ask-text">{parts.prose}</p>}
                    <TakeAnswer data={data} text={answer.text} canEdit={canEdit} />
                  </div>
                )}
              </div>
              {!ai && (
                <div className="find-ask-paste">
                  {canEdit && (
                    <>
                      <label className="field">
                        <span>{m.ai.pasteAnswer}</span>
                        <textarea className="textarea" rows={2} value={pasted} spellCheck={false} onChange={(e) => setPasted(e.target.value)} />
                      </label>
                      <TakeAnswer data={data} text={pasted} canEdit={canEdit} pasted />
                    </>
                  )}
                </div>
              )}
            </section>
          )}
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
        {/* The logo's own magnifier: finding is what Propario does, not a text search. */}
        <img className="find-ask-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={24} height={24} />
        <span className="hide-narrow" aria-hidden="true">
          {m.ai.open}
        </span>
      </button>
    </div>
  )
}

/** Where to search, as compact chips under a short caption; each opens in a new tab. */
function ChipLinks({ label, links }: { label: string; links: LookupLink[] }) {
  const { m } = useI18n()
  if (!links.length) return null
  return (
    <div className="chip-links">
      <span className="small muted">{label}</span>
      <ul>
        {links.map((l) => (
          <li key={l.id}>
            <a href={l.href} target="_blank" rel="noopener noreferrer">
              {m.lookup[l.id]}
              <Glyph name="out" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
