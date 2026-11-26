import { useEffect, useRef, useState } from 'react'
import { addProperty, addRequirement, deleteProject, loadBundle, updateProject } from '../../db/repo'
import { PRIORITIES, type Priority } from '../../db/types'
import { linksIn, sameLink } from '../../domain/links'
import { ruleFromText, startNeeded, startSteps, untouched } from '../../domain/start'
import { factsFromUrl } from '../../domain/url-facts'
import { hostOf, normalizeUrl, parseNumber } from '../../domain/values'
import { useI18n } from '../../i18n'
import { useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { CommitInput, CommitTextarea } from '../../ui/inputs'
import { addFromLink, QuickAdd } from './QuickAdd'
import type { ProjectData } from './useProjectData'

/** Closed start cards, per comparison: a convenience of this device, so in its browser storage. */
const closedKey = (projectId: string) => `propario.start-closed.${projectId}`
function readClosed(projectId: string): boolean {
  try {
    return localStorage.getItem(closedKey(projectId)) === '1'
  } catch {
    return false
  }
}

/**
 * Whether the start card shows. Decided when a comparison is opened: something is still missing
 * and the card was not closed here. While one works in it, it stays, so nothing vanishes under
 * one's hands; it goes when closed.
 */
export function useStartCard(data: ProjectData | null | undefined, canEdit: boolean) {
  const [shown, setShown] = useState<{ id: string; open: boolean } | null>(null)
  const id = data?.project.id ?? ''
  if (data && canEdit && shown?.id !== id) {
    setShown({ id, open: !readClosed(id) && startNeeded(startSteps(data.project, data.products, data.requirements)) })
  }
  const close = () => {
    try {
      localStorage.setItem(closedKey(id), '1')
    } catch {
      // Without storage it stays closed until the page is left.
    }
    setShown({ id, open: false })
  }
  return { open: !!data && canEdit && shown?.id === id && shown.open, close }
}

/** Comparisons whose page is shown right now; React may unmount and mount again at once. */
const shownNow = new Set<string>()

/**
 * A comparison made by "New comparison" (`firstName` is the name it got) that is left without
 * anything in it is removed again, so a click by mistake leaves nothing behind. Leaving means
 * closing its start card, going back or going anywhere else. A comparison that existed before
 * is never touched.
 */
export function useDropIfUntouched(data: ProjectData | null | undefined, firstName: string | undefined) {
  const id = data?.project.id
  useEffect(() => {
    if (!id || !firstName) return
    shownNow.add(id)
    return () => {
      shownNow.delete(id)
      // Checked a moment later and as stored, so a name typed just before leaving is saved first
      // and counts; shown again by then means it was not left.
      setTimeout(async () => {
        if (shownNow.has(id)) return
        const b = await loadBundle(id)
        if (b && untouched(b.project, firstName, b.products, b.requirements, b.properties)) await deleteProject(id)
      }, LEAVE_DELAY)
    }
  }, [id, firstName])
  return !!data && !!firstName && untouched(data.project, firstName, data.products, data.requirements, data.properties)
}

/** How long after leaving a new comparison it is checked: enough for a last edit to be stored. */
const LEAVE_DELAY = 300

/**
 * Instead of an empty table: four steps to a comparison worth looking at. Its name and what one
 * is looking for, in one's own words (the comparison's goal; its links can become products), how much it
 * may cost, what a product must be, and a first candidate. Each is the same input as in its own
 * tab. A requirement with a limit and a number ("Width at most 60 cm") gets its number field and
 * an automatic check, as the requirements tab would offer.
 */
export function StartCard({
  data,
  onOpen,
  onClose,
  onRequirements,
}: {
  data: ProjectData
  onOpen: (id: string) => void
  onClose: () => void
  onRequirements: () => void
}) {
  const { m } = useI18n()
  const toast = useToast()
  const { project, products, requirements, properties } = data
  const steps = startSteps(project, products, requirements)
  const links = linksIn(project.description).filter((url) => !products.some((p) => sameLink(p.url, url)))
  const [label, setLabel] = useState('')
  const [priority, setPriority] = useState<Priority>('must')
  /** The unit of the common criterion chosen last, for a number typed without one. */
  const [unit, setUnit] = useState('')
  const input = useRef<HTMLInputElement>(null)
  /** Nothing in it yet: the name is the first thing to type. */
  const fresh = !project.description && !products.length && !requirements.length

  const addCriterion = async () => {
    const text = label.trim()
    if (!text) return
    // Cleared at once, so what is typed next while this one is saved is kept.
    const rule = ruleFromText(text, unit)
    setLabel('')
    setUnit('')
    let condition = null
    if (rule) {
      const field =
        properties.find((p) => p.type === 'number' && p.name.toLowerCase() === rule.name.toLowerCase()) ??
        (await addProperty(project.id, { name: rule.name, type: 'number', unit: rule.unit }))
      condition = { target: { kind: 'property' as const, propertyId: field.id }, op: rule.op, value: rule.value }
    }
    await addRequirement(project.id, { label: text, priority, condition })
  }

  const mark = (n: number, done: boolean) => (
    <span className={`start-mark${done ? ' done' : ''}`}>
      {done ? (
        <>
          <Glyph name="check" />
          <span className="sr-only">{m.firstSteps.done}</span>
        </>
      ) : (
        n
      )}
    </span>
  )

  return (
    <section className="start-card" aria-labelledby="start-title">
      <div className="start-head">
        <h2 id="start-title">{m.firstSteps.title}</h2>
        <button type="button" className="icon-btn" aria-label={m.firstSteps.close} title={m.firstSteps.close} onClick={onClose}>
          <Glyph name="close" />
        </button>
      </div>
      <ol className="start-steps">
        <li>
          {mark(1, steps.goal)}
          <div className="start-body">
            <label className="field start-name">
              <span>{m.field.name}</span>
              <CommitInput
                className="input"
                value={project.name}
                placeholder={m.home.namePlaceholder}
                autoFocus={fresh}
                onFocus={(e) => e.currentTarget.select()}
                onCommit={(v) => v.trim() && updateProject(project.id, { name: v.trim() })}
              />
            </label>
            <label className="field">
              <span>{m.firstSteps.goal}</span>
              <CommitTextarea
                className="textarea"
                rows={4}
                value={project.description}
                placeholder={m.firstSteps.goalPlaceholder}
                aria-describedby="start-goal-hint"
                onCommit={(v) => updateProject(project.id, { description: v })}
              />
            </label>
            <p id="start-goal-hint" className="small muted">
              {m.firstSteps.goalHint}
            </p>
            {links.length > 0 && (
              <div className="start-links">
                <span className="small muted">{m.firstSteps.links}</span>
                {links.map((url) => (
                  <button key={url} type="button" className="btn sm" title={url} onClick={() => void addFromLink(project.id, normalizeUrl(url), m, toast)}>
                    <Glyph name="plus" /> {m.firstSteps.addLink(factsFromUrl(url).name || hostOf(url))}
                  </button>
                ))}
              </div>
            )}
          </div>
        </li>
        <li>
          {mark(2, steps.budget)}
          <div className="start-body">
            <h3>{m.firstSteps.budgetTitle}</h3>
            <p className="small muted">{m.firstSteps.budgetHint}</p>
            <label className="start-budget">
              <span>{m.firstSteps.budget}</span>
              <CommitInput
                className="input num"
                inputMode="decimal"
                value={project.budget != null ? String(project.budget) : ''}
                onCommit={(v) => {
                  const n = parseNumber(v)
                  void updateProject(project.id, { budget: n !== null && n >= 0 ? n : null })
                }}
              />
            </label>
          </div>
        </li>
        <li>
          {mark(3, requirements.length > 0)}
          <div className="start-body">
            <h3>{m.firstSteps.criteria}</h3>
            <p className="small muted">{m.firstSteps.criteriaHint}</p>
            {requirements.length > 0 && (
              <ul className="start-reqs">
                {requirements.map((r) => (
                  <li key={r.id}>
                    <span className="prio" data-p={r.priority}>
                      {m.priority[r.priority]}
                    </span>{' '}
                    {r.label}
                  </li>
                ))}
              </ul>
            )}
            <div className="start-links">
              <span className="small muted">{m.firstSteps.common}</span>
              {m.firstSteps.suggestions.map((s) => {
                const [text, u] = s.split('|')
                return (
                  <button
                    key={text}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setLabel(`${text} `)
                      setUnit(u)
                      input.current?.focus()
                    }}
                  >
                    {text} … {u}
                  </button>
                )
              })}
            </div>
            <form
              className="quick-add"
              onSubmit={(e) => {
                e.preventDefault()
                void addCriterion()
              }}
            >
              <Glyph name="plus" />
              <input
                ref={input}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={m.requirements.labelPlaceholder}
                aria-label={m.field.requirement}
              />
              <select
                className="select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                aria-label={m.field.priority}
                style={{ width: 'auto', minHeight: 32 }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {m.priority[p]}
                  </option>
                ))}
              </select>
              <button className="btn primary sm" type="submit" disabled={!label.trim()}>
                {m.requirements.add}
              </button>
            </form>
            <div>
              <button type="button" className="btn ghost sm" onClick={onRequirements}>
                {m.firstSteps.allRequirements}
              </button>
            </div>
          </div>
        </li>
        <li>
          {mark(4, steps.product)}
          <div className="start-body">
            <h3>{m.firstSteps.product}</h3>
            <p className="small muted">{m.firstSteps.productHint}</p>
            <QuickAdd data={data} onOpen={onOpen} inline />
          </div>
        </li>
      </ol>
      {!startNeeded(steps) && (
        <div className="start-finish">
          <button type="button" className="btn primary" onClick={onClose}>
            <Glyph name="check" /> {m.firstSteps.finish}
          </button>
        </div>
      )}
    </section>
  )
}
