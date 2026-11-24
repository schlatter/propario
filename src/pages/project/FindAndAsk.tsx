import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { comparisonForAi } from '../../domain/ai-export'
import { searchLinks, searchTerm } from '../../domain/lookup'
import { useI18n } from '../../i18n'
import { useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { QuickAdd } from './QuickAdd'
import { LookupRow } from './SourcesSections'
import type { ProjectData } from './useProjectData'

/**
 * Finding more products and asking about them, always at hand: a button bottom right that opens
 * a small panel. Without AI it searches the shops for what is being compared and takes the
 * link of what was found. With one's own AI it copies the comparison with a request – more
 * products, or one's own question – and the answer comes back through "Add or update products".
 * Propario itself sends nothing anywhere.
 */
export function FindAndAsk({ data, canEdit, onOpen }: { data: ProjectData; canEdit: boolean; onOpen: (id: string) => void }) {
  const { m, fmt } = useI18n()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [question, setQuestion] = useState('')
  const toggle = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const id = useId()
  const { project } = data

  const show = () => {
    setQuery(searchTerm(project.name, data.products))
    setOpen(true)
  }
  const hide = () => {
    setOpen(false)
    toggle.current?.focus()
  }
  useEffect(() => {
    if (open) search.current?.focus()
  }, [open])

  const copy = (request: string) =>
    navigator.clipboard
      .writeText(comparisonForAi(data, m, fmt, request))
      .then(() => toast(m.ai.copied))
      .catch(() => toast(m.ai.failed))

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
            <p className="muted small">{m.ai.withAiHint}</p>
            <button type="button" className="btn" onClick={() => void copy(m.ai.suggestPrompt)}>
              <Glyph name="copy" /> {m.ai.suggest}
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
            <button type="button" className="btn" onClick={() => void copy(question)}>
              <Glyph name="copy" /> {m.ai.copy}
            </button>
            {canEdit && (
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
