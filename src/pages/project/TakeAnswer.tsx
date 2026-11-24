import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProject } from '../../db/repo'
import { answerLinks, splitAnswer } from '../../domain/ai-export'
import { hostOf } from '../../domain/values'
import { useI18n } from '../../i18n'
import { useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { addFromLink } from './QuickAdd'
import type { ProjectData } from './useProjectData'

/**
 * What an AI's answer offers to take into the comparison – whether it came from one's own AI or
 * was pasted back: its table, opened in the preview of "Add or update products", and the product
 * links in its text, to tick and add – each page is then read by Propario itself, so pictures,
 * prices and dimensions come from the shop, not from the AI.
 */
export function TakeAnswer({ data, text, canEdit, pasted }: { data: ProjectData; text: string; canEdit: boolean; pasted?: boolean }) {
  const { m } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const id = useId()
  const { rows, prose } = splitAnswer(text)
  const links = answerLinks(prose, data.products)
  /** Links the person unticked. */
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  /** How many links were just added (they then count as known and leave the list). */
  const [added, setAdded] = useState(0)
  if (!canEdit) return rows > 0 ? <p className="muted small">{m.ai.answerTable(rows)}</p> : null
  if (!rows && !links.length)
    return added ? (
      <p className="small" role="status">
        {m.ai.linksAdded(added)}
      </p>
    ) : pasted && text.trim() ? (
      <p className="small muted" role="status">
        {m.ai.noTable}
      </p>
    ) : null

  const chosen = links.filter((l) => !skip.has(l))
  const add = async () => {
    setBusy(true)
    try {
      for (const url of chosen) await addFromLink(data.project.id, url, m, toast, true)
      if (data.project.status === 'research') void updateProject(data.project.id, { status: 'comparing' })
      setAdded(chosen.length)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="take-answer">
      {rows > 0 && (
        <>
          <p className="muted small">{m.ai.answerTable(rows)}</p>
          <button type="button" className="btn primary" onClick={() => navigate(`/p/${data.project.id}/merge`, { state: { text, read: true } })}>
            <Glyph name="upload" /> {m.ai.readAnswer}
          </button>
        </>
      )}
      {links.length > 0 && (
        <fieldset className="take-links" aria-describedby={`${id}-hint`}>
          <legend className="small">{m.ai.linksFound(links.length)}</legend>
          <p id={`${id}-hint`} className="muted small">
            {m.ai.linksHint}
          </p>
          {links.map((url) => (
            <label key={url} className="check take-link">
              <input
                type="checkbox"
                checked={!skip.has(url)}
                onChange={(e) => {
                  const next = new Set(skip)
                  if (e.target.checked) next.delete(url)
                  else next.add(url)
                  setSkip(next)
                }}
              />
              <span>
                <strong>{hostOf(url)}</strong> {shortPath(url)}
              </span>
            </label>
          ))}
          <button type="button" className="btn primary" disabled={busy || !chosen.length} onClick={() => void add()}>
            <Glyph name="plus" /> {m.ai.addLinks(chosen.length)}
          </button>
        </fieldset>
      )}
    </div>
  )
}

/** The part of a link after the shop's name, short enough for one line. */
function shortPath(url: string): string {
  try {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname + u.search).replace(/\/$/, '')
    return path.length > 48 ? `${path.slice(0, 46)}…` : path
  } catch {
    return url
  }
}
