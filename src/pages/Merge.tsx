/**
 * Products from a table into this comparison: paste an AI's answer, rows copied from Excel, CSV
 * or Markdown, or choose a file. The plan (src/import/merge.ts) shows what is new and what
 * changes; only what stays ticked is saved.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { mergeProducts } from '../db/repo'
import type { Product } from '../db/types'
import { formatValue, productName } from '../domain/display'
import { useI18n } from '../i18n'
import { planMerge, type MergeChange, type MergePlan } from '../import/merge'
import { readTableFile, TABLE_FILES } from '../import/read-file'
import { textToGrids } from '../import/table-text'
import type { FieldTarget } from '../import/synonyms'
import { rolesOf } from '../sync'
import { useToast } from '../ui/Dialog'
import { Glyph } from '../ui/Glyph'
import { useProjectData } from './project/useProjectData'

export function MergePage() {
  const { id } = useParams()
  const data = useProjectData(id)
  const role = useLiveQuery(async () => (await rolesOf())[id ?? ''], [id])
  const { m, fmt } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<MergePlan | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  /** Items (by index) and new fields (by key) the person unticked. */
  const [skip, setSkip] = useState<Set<number>>(new Set())
  const [skipFields, setSkipFields] = useState<Set<string>>(new Set())
  const [over, setOver] = useState(false)

  if (data === undefined) return <main aria-busy="true" />
  if (data === null)
    return (
      <main>
        <div className="empty">{m.common.notFound}</div>
      </main>
    )
  const back = `/p/${data.project.id}`

  const show = (next: MergePlan | null) => {
    setSkip(new Set())
    setSkipFields(new Set())
    setPlan(next)
    setError(next ? '' : m.merge.noTable)
  }
  const readText = () => show(planMerge(textToGrids(text), data.products, data.properties))
  const readFile = async (file: File) => {
    setBusy(true)
    try {
      show(planMerge(Object.values(await readTableFile(file)), data.products, data.properties))
    } catch {
      setPlan(null)
      setError(m.merge.noTable)
    } finally {
      setBusy(false)
    }
  }

  const fieldName = (key: string) => data.propMap.get(key)?.name ?? plan?.newFields.find((f) => f.key === key)?.name ?? key
  const show1 = (c: MergeChange, v: unknown): string => {
    if (v === undefined || v === null || v === '') return m.merge.empty
    if (c.key === 'values') {
      const prop = data.propMap.get(c.field!)
      return prop ? formatValue(prop, v as Product['values'][string], m, fmt) : typeof v === 'boolean' ? (v ? m.common.yes : m.common.no) : String(v)
    }
    if (c.key === 'price') return fmt.money(v as number)
    if (c.key === 'candidate') return m.candidate[v as Product['candidate']]
    return String(v)
  }
  const label = (c: MergeChange) => (c.key === 'values' ? fieldName(c.field!) : m.importer.target_[c.key as Exclude<FieldTarget, 'property'>])

  // What would be saved with the current ticks.
  const drop = (values: Product['values'] | undefined) => Object.fromEntries(Object.entries(values ?? {}).filter(([k]) => !skipFields.has(k)))
  const chosen = (plan?.items ?? []).map((item, i) => ({ item, i })).filter(({ item, i }) => item.kind !== 'same' && !skip.has(i))
  const adds = chosen.filter(({ item }) => item.kind === 'new').map(({ item }) => ({ ...item.incoming, values: drop(item.incoming.values) }))
  const updates = chosen
    .filter(({ item }) => item.kind === 'update')
    .map(({ item }) => {
      const patch = { ...item.patch }
      if (patch.values) {
        patch.values = drop(patch.values)
        if (!Object.keys(patch.values).length) delete patch.values
      }
      return { product: item.existing!, patch }
    })
    .filter((u) => Object.keys(u.patch).length)
  const used = new Set([...adds.flatMap((p) => Object.keys(p.values)), ...updates.flatMap((u) => Object.keys(u.patch.values ?? {}))])
  const fields = (plan?.newFields ?? []).filter((f) => !skipFields.has(f.key) && used.has(f.key))
  const count = (kind: 'new' | 'update' | 'same') => plan?.items.filter((x) => x.kind === kind).length ?? 0

  const apply = async () => {
    setBusy(true)
    try {
      await mergeProducts(data.project.id, fields, adds, updates)
      toast(m.merge.done(adds.length, updates.length))
      // Back to the table as it was left, with its filters; a direct visit goes to the comparison.
      if (location.key !== 'default') navigate(-1)
      else navigate(back)
    } finally {
      setBusy(false)
    }
  }
  const toggle = <T,>(set: Set<T>, value: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  return (
    <main className="merge-page">
      <div className="page-head">
        <Link to={back} className="btn ghost sm">
          <Glyph name="chevronLeft" /> {data.project.name}
        </Link>
        <h1>{m.merge.title}</h1>
      </div>
      {role === 'viewer' ? (
        <p className="notice info">{m.share.readOnly}</p>
      ) : !plan ? (
        <div
          className={`stack merge-input${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) void readFile(f)
          }}
        >
          <p className="muted">{m.merge.intro}</p>
          <label className="field">
            <span>{m.merge.paste}</span>
            <textarea
              className="textarea merge-text"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={m.merge.placeholder}
              spellCheck={false}
            />
          </label>
          {error && (
            <p className="small pimg-error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <button type="button" className="btn primary" disabled={!text.trim() || busy} onClick={readText}>
              {m.merge.read}
            </button>
            <label className="btn">
              <Glyph name="upload" /> {m.merge.chooseFile}
              <input
                type="file"
                accept={TABLE_FILES}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void readFile(f)
                }}
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p role="status">{m.merge.summary(count('new'), count('update'), count('same'))}</p>
          <section className="panel stack" aria-labelledby="merge-columns">
            <h2 id="merge-columns">{m.merge.columns}</h2>
            <ul className="merge-columns">
              {plan.columns.map((c, i) => (
                <li key={i}>
                  <b>{c.header}</b> →{' '}
                  {c.kind === 'builtin' ? (
                    m.importer.target_[c.target as Exclude<FieldTarget, 'property'>]
                  ) : c.kind === 'field' ? (
                    fieldName(c.target)
                  ) : c.kind === 'new' ? (
                    <label className="check">
                      <input type="checkbox" checked={!skipFields.has(c.target)} onChange={() => toggle(skipFields, c.target, setSkipFields)} />{' '}
                      {m.merge.createField(fieldName(c.target))}
                    </label>
                  ) : (
                    <span className="muted">{m.merge.unused}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <ul className="merge-items" aria-label={m.merge.items}>
            {plan.items.map((item, i) =>
              item.kind === 'same' ? null : (
                <li key={i} className={`merge-item ${item.kind}`}>
                  <label className="check">
                    <input type="checkbox" checked={!skip.has(i)} onChange={() => toggle(skip, i, setSkip)} />
                    <span className={`pill ${item.kind === 'new' ? 'pass' : 'upd'}`}>{item.kind === 'new' ? m.merge.isNew : m.merge.isUpdate}</span>
                    <b>{productName(item.existing ?? item.incoming, m.product.unnamed)}</b>
                    {item.kind === 'new' && item.incoming.price !== null && <span className="muted">{fmt.money(item.incoming.price)}</span>}
                  </label>
                  {item.kind === 'update' && (
                    <ul className="merge-changes">
                      {item.changes
                        .filter((c) => !(c.field && skipFields.has(c.field)))
                        .map((c, j) => (
                          <li key={j}>
                            <span className="muted">{label(c)}:</span> <s>{show1(c, c.from)}</s> → <span>{show1(c, c.to)}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ),
            )}
          </ul>
          {count('same') > 0 && <p className="muted small">{m.merge.unchanged(count('same'))}</p>}
          <div className="sticky-actions">
            <button type="button" className="btn primary" disabled={busy || !(adds.length + updates.length)} onClick={apply}>
              {m.merge.apply(adds.length, updates.length)}
            </button>
            <button type="button" className="btn ghost" onClick={() => setPlan(null)}>
              {m.merge.another}
            </button>
            {!(count('new') + count('update')) && <span className="muted">{m.merge.nothing}</span>}
          </div>
        </div>
      )}
    </main>
  )
}
