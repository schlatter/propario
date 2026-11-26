import { useEffect, useId, useState } from 'react'
import { api } from '../../api'
import { isDemo } from '../../demo'
import { splitAnswer, startForAi } from '../../domain/ai-export'
import { useSettings } from '../../hooks'
import { useI18n } from '../../i18n'
import { useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { InfoTip } from '../../ui/InfoTip'
import { aiMessage, type AiSettings } from '../AiSettings'
import { AI_CHATS, copyForChat, readChat, saveChat, type Chat } from './ai-chat'
import { TakeAnswer } from './TakeAnswer'
import type { ProjectData } from './useProjectData'

/**
 * The start with one's own AI, optional: what the person wrote becomes a request for
 * requirements, candidates and open questions (`startForAi`). Sent to the AI connected in
 * Settings when asked, or copied for the chat one uses; the answer comes back through
 * `TakeAnswer`, so its tables are seen in "Add or update products" before anything is saved.
 */
export function StartWithAi({ data }: { data: ProjectData }) {
  const { m, fmt } = useI18n()
  const toast = useToast()
  const id = useId()
  const useAi = useSettings().useAi === true
  /** One's own AI, if connected (undefined: not asked yet). */
  const [ai, setAi] = useState<AiSettings | undefined>(useAi && !isDemo() ? undefined : null)
  const [chat, setChat] = useState<Chat>(readChat)
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<{ text: string } | { problem: string } | null>(null)
  const [pasted, setPasted] = useState('')
  /** The field for the answer shows once the request was copied: then it is needed. */
  const [copied, setCopied] = useState(false)
  const ready = data.project.description.trim() !== ''

  useEffect(() => {
    if (ai !== undefined) return
    api<AiSettings>('/api/me/ai')
      .then(setAi)
      .catch(() => setAi(null))
  }, [ai])

  const request = () => startForAi(data, m, fmt)
  const send = async () => {
    setAsking(true)
    setAnswer(null)
    try {
      const r = await api<{ answer: string }>('/api/ai/ask', { body: { text: request(), search: true }, timeoutMs: 240_000 })
      setAnswer({ text: r.answer })
    } catch (e) {
      setAnswer({ problem: aiMessage(e, m.ai.problem) })
    } finally {
      setAsking(false)
    }
  }
  const prose = answer && 'text' in answer ? splitAnswer(answer.text).prose : ''

  return (
    <section className="start-ai" aria-labelledby={`${id}-title`}>
      <div className="start-links">
        <h4 id={`${id}-title`}>{m.firstSteps.aiTitle}</h4>
        <InfoTip text={ready ? m.firstSteps.aiHint : m.firstSteps.aiNeedsGoal} />
        {ai ? (
          <>
            <button type="button" className="btn sm" disabled={!ready || asking} onClick={() => void send()}>
              <Glyph name="search" /> {m.firstSteps.aiAsk(m.ai.settings.providers[ai.provider])}
            </button>
            {/* Copying stays: for another AI, or when the API account has no credit. */}
            <button
              type="button"
              className="icon-btn"
              disabled={!ready}
              aria-label={m.firstSteps.aiCopy}
              title={m.firstSteps.aiCopy}
              onClick={() => void copyForChat(request(), '', m, toast)}
            >
              <Glyph name="copy" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn sm"
              disabled={!ready}
              onClick={() => {
                setCopied(true)
                void copyForChat(request(), chat, m, toast)
              }}
            >
              <Glyph name="copy" /> {m.firstSteps.aiCopy}
            </button>
            <label className="start-chat">
              <span className="small muted">{m.ai.openIn}</span>
              <select
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
          </>
        )}
      </div>
      <div aria-live="polite">
        {asking && <p className="muted small">{m.ai.asking}</p>}
        {answer && 'problem' in answer && (
          <p className="small pimg-error" role="alert">
            {answer.problem}
          </p>
        )}
        {answer && 'text' in answer && (
          <div className="find-ask-answer">
            {prose && <p className="find-ask-text">{prose}</p>}
            <TakeAnswer data={data} text={answer.text} canEdit />
          </div>
        )}
      </div>
      {!ai && (copied || pasted) && (
        <>
          <label className="field">
            <span>{m.firstSteps.aiAnswer}</span>
            <textarea className="textarea" rows={2} value={pasted} spellCheck={false} onChange={(e) => setPasted(e.target.value)} />
          </label>
          <TakeAnswer data={data} text={pasted} canEdit pasted />
        </>
      )}
    </section>
  )
}
