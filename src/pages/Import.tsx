import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../db/db'
import { ImageError, loadImages, missingImages, type ImageErrorCode } from '../images'
import { insertBundle, uniqueProjectName } from '../db/repo'
import { PRIORITIES, PROPERTY_TYPES, type Priority, type PropertyType } from '../db/types'
import { OP_SYMBOL } from '../domain/requirements'
import {
  analyzeGrids,
  buildBundles,
  previewProducts,
  reanalyzeSheet,
  rereadRequirements,
  type ColumnMapping,
  type SheetDraft,
  type SheetKind,
  type WorkbookDraft,
} from '../import/excel'
import { readTableFile, TABLE_FILES } from '../import/read-file'
import { FIELD_TARGETS, type FieldTarget, type ReqTarget } from '../import/synonyms'
import { useSettings } from '../hooks'
import { useI18n } from '../i18n'
import { Glyph } from '../ui/Glyph'
import { Field } from '../ui/inputs'

type Step = 'choose' | 'review' | 'done'
interface Result {
  id: string
  name: string
  products: number
  requirements: number
}

export function ImportPage() {
  const { m } = useI18n()
  const settings = useSettings()
  const [step, setStep] = useState<Step>('choose')
  const [draft, setDraft] = useState<WorkbookDraft | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState<string>('')
  const [results, setResults] = useState<Result[]>([])
  // Pictures are fetched right after the import, from each product's link (or image column).
  const [images, setImages] = useState<{ done: number; total: number; loaded?: number; failed?: number; error?: ImageErrorCode } | null>(null)
  const [over, setOver] = useState(false)

  const load = async (file: File) => {
    setError('')
    setBusy(true)
    try {
      const d = analyzeGrids(await readTableFile(file), file.name, { people: settings.people })
      if (!d.sheets.length) throw new Error('no table')
      setDraft(d)
      setCurrent(d.sheets.find((s) => s.include)?.sheetName ?? d.sheets[0]?.sheetName ?? '')
      setStep('review')
    } catch (e) {
      console.error(e)
      setError(m.importer.readError)
    } finally {
      setBusy(false)
    }
  }

  const run = async () => {
    if (!draft) return
    setBusy(true)
    try {
      const out: Result[] = []
      for (const b of buildBundles(draft)) {
        b.project.name = await uniqueProjectName(b.project.name)
        await insertBundle(b)
        out.push({ id: b.project.id, name: b.project.name, products: b.products.length, requirements: b.requirements.length })
      }
      setResults(out)
      setStep('done')
      setBusy(false)
      await loadImportedImages(out.map((r) => r.id))
    } finally {
      setBusy(false)
    }
  }

  const loadImportedImages = async (projectIds: string[]) => {
    const products = (await Promise.all(projectIds.map((id) => db.products.where('projectId').equals(id).toArray()))).flat()
    const missing = missingImages(products)
    if (!missing.length) return
    setImages({ done: 0, total: missing.length })
    try {
      const r = await loadImages(missing, (done, total) => setImages({ done, total }))
      setImages({ done: missing.length, total: missing.length, loaded: r.loaded, failed: r.failed.length })
    } catch (e) {
      setImages({ done: 0, total: missing.length, error: e instanceof ImageError ? e.code : 'failed' })
    }
  }

  const stepIndex = { choose: 0, review: 1, done: 2 }[step]

  return (
    <main className={step === 'review' ? 'wide' : ''}>
      <div className="page-head">
        <h1>{m.importer.title}</h1>
      </div>
      <ol className="steps" aria-label={m.importer.title}>
        {m.importer.steps.map((s, i) => (
          <li key={s} aria-current={i === stepIndex ? 'step' : undefined}>
            <b>{i + 1}</b>
            {s}
          </li>
        ))}
      </ol>

      {step === 'choose' && (
        <div className="stack">
          <p className="muted">{m.importer.intro}</p>
          <div
            className={`dropzone${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              const f = e.dataTransfer.files[0]
              if (f) void load(f)
            }}
          >
            <label className="btn primary">
              <Glyph name="upload" /> {m.importer.choose}
              <input
                type="file"
                accept={TABLE_FILES}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void load(f)
                  e.target.value = ''
                }}
              />
            </label>
            <span className="muted small">{busy ? m.importer.reading : m.importer.dropHint}</span>
            {error && (
              <p role="alert" style={{ color: 'var(--fail)' }}>
                {error}
              </p>
            )}
          </div>
          <p className="muted small">{m.importer.untested}</p>
        </div>
      )}

      {step === 'review' && draft && (
        <Review
          draft={draft}
          setDraft={setDraft}
          current={current}
          setCurrent={setCurrent}
          people={settings.people}
          busy={busy}
          onRun={run}
          onBack={() => setStep('choose')}
        />
      )}

      {step === 'done' && (
        <div className="panel stack">
          <h2>{m.importer.done}</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {results.map((r) => (
              <li key={r.id}>
                <Link to={`/p/${r.id}`}>{m.importer.resultLine(r.name, r.products, r.requirements)}</Link>
              </li>
            ))}
          </ul>
          {images && (
            <p role="status" className="muted">
              {images.error
                ? m.image.error[images.error]
                : images.loaded === undefined
                  ? m.image.loading(images.done, images.total)
                  : m.image.bulkResult(images.loaded, images.failed ?? 0)}
            </p>
          )}
          <div className="row">
            <Link to="/" className="btn primary">
              {m.importer.goHome}
            </Link>
            <button
              className="btn"
              onClick={() => {
                setDraft(null)
                setResults([])
                setImages(null)
                setStep('choose')
              }}
            >
              {m.importer.another}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function Review({
  draft,
  setDraft,
  current,
  setCurrent,
  people,
  busy,
  onRun,
  onBack,
}: {
  draft: WorkbookDraft
  setDraft: (d: WorkbookDraft) => void
  current: string
  setCurrent: (s: string) => void
  people: string[]
  busy: boolean
  onRun: () => void
  onBack: () => void
}) {
  const { m } = useI18n()
  const existingNames = useLiveQuery(async () => new Set((await db.projects.toArray()).map((p) => p.name)), [], new Set<string>())
  const sheet = draft.sheets.find((s) => s.sheetName === current)

  const replaceSheet = (next: SheetDraft) => setDraft({ ...draft, sheets: draft.sheets.map((s) => (s.sheetName === next.sheetName ? next : s)) })
  const patchSheet = (patch: Partial<SheetDraft>) => sheet && replaceSheet({ ...sheet, ...patch })
  const setAll = (include: boolean) => setDraft({ ...draft, sheets: draft.sheets.map((s) => ({ ...s, include: include && s.kind !== 'skip' })) })

  const included = draft.sheets.filter((s) => s.include && s.kind === 'products')
  const totalProducts = included.reduce((n, s) => n + s.productRowCount, 0)

  return (
    <>
      <div className="import-layout">
        <aside className="sheet-list" aria-label={m.importer.sheets}>
          <div className="sheet-list-head">
            <button className="btn sm ghost" onClick={() => setAll(true)}>
              {m.importer.selectAll}
            </button>
            <button className="btn sm ghost" onClick={() => setAll(false)}>
              {m.importer.selectNone}
            </button>
          </div>
          {draft.sheets.map((s) => (
            <div className="sheet-item" key={s.sheetName} aria-current={s.sheetName === current}>
              <input
                type="checkbox"
                aria-label={s.sheetName}
                checked={s.include}
                disabled={s.kind === 'skip'}
                onChange={(e) => replaceSheet({ ...s, include: e.target.checked })}
              />
              <button className="name" onClick={() => setCurrent(s.sheetName)}>
                {s.sheetName}
              </button>
              {(s.warnings.length > 0 || s.columns.some((c) => !c.confident)) && <span className="warn-dot" title={m.importer.check} />}
              <span className="meta">
                {s.kind === 'products' ? s.productRowCount : s.kind === 'requirements' ? `${s.requirements.length} ${m.importer.kind.requirements}` : '–'}
              </span>
            </div>
          ))}
        </aside>

        {sheet && (
          <SheetEditor
            key={sheet.sheetName}
            draft={draft}
            sheet={sheet}
            patchSheet={patchSheet}
            replaceSheet={replaceSheet}
            people={people}
            existingNames={existingNames}
          />
        )}
      </div>

      <div className="sticky-actions">
        <button className="btn" onClick={onBack}>
          <Glyph name="chevronLeft" /> {m.common.back}
        </button>
        <span className="spacer" />
        <span className="small">{m.importer.summary(included.length, totalProducts)}</span>
        <button className="btn primary" disabled={busy || included.length === 0} onClick={onRun}>
          {busy ? m.importer.running : m.importer.run}
        </button>
      </div>
    </>
  )
}

function SheetEditor({
  draft,
  sheet,
  patchSheet,
  replaceSheet,
  people,
  existingNames,
}: {
  draft: WorkbookDraft
  sheet: SheetDraft
  patchSheet: (p: Partial<SheetDraft>) => void
  replaceSheet: (s: SheetDraft) => void
  people: string[]
  existingNames: Set<string>
}) {
  const { m } = useI18n()
  const grid = draft.grids[sheet.sheetName]
  const preview = useMemo(() => (sheet.kind === 'products' ? previewProducts(draft, sheet) : []), [draft, sheet])
  const productSheets = draft.sheets.filter((s) => s.kind === 'products')

  const setColumn = (index: number, patch: Partial<ColumnMapping>) =>
    patchSheet({ columns: sheet.columns.map((c) => (c.index === index ? { ...c, ...patch, confident: true } : c)) })

  return (
    <section className="panel stack" style={{ gap: 18, minWidth: 0 }} aria-label={sheet.sheetName}>
      <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
        <h2 style={{ flex: '1 1 auto' }}>{sheet.sheetName}</h2>
        <label className="check">
          <input type="checkbox" checked={sheet.include} disabled={sheet.kind === 'skip'} onChange={(e) => patchSheet({ include: e.target.checked })} />
          {m.importer.run}
        </label>
      </div>

      {sheet.warnings.map((w) => (
        <div className="notice" role="note" key={w}>
          <p>{m.importer.warnings[w as keyof typeof m.importer.warnings] ?? w}</p>
        </div>
      ))}

      <div className="grid-2">
        <Field label={m.importer.kindLabel}>
          <select
            className="select"
            value={sheet.kind}
            onChange={(e) => {
              const kind = e.target.value as SheetKind
              if (kind === 'skip') return patchSheet({ kind, include: false })
              const next = reanalyzeSheet(draft, sheet.sheetName, sheet.headerRow, { people })
              replaceSheet({ ...next, kind, include: true, attachTo: kind === 'requirements' ? (productSheets[0]?.sheetName ?? null) : null })
            }}
          >
            {(['products', 'requirements', 'skip'] as SheetKind[]).map((k) => (
              <option key={k} value={k}>
                {m.importer.kind[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={m.importer.headerRow}>
          <select
            className="select"
            value={sheet.headerRow}
            onChange={(e) => {
              const next = reanalyzeSheet(draft, sheet.sheetName, Number(e.target.value), { people })
              replaceSheet({ ...next, include: next.kind !== 'skip' })
            }}
          >
            {grid.slice(0, 25).map((row, i) => (
              <option key={i} value={i}>
                {i + 1}:{' '}
                {row
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((c) => c!.w)
                  .join(' · ')
                  .slice(0, 60)}
              </option>
            ))}
          </select>
        </Field>
        {sheet.kind === 'products' && (
          <>
            <Field label={m.importer.projectName}>
              <input className="input" value={sheet.projectName} onChange={(e) => patchSheet({ projectName: e.target.value })} />
            </Field>
            <Field label={m.field.category}>
              <input className="input" value={sheet.category} onChange={(e) => patchSheet({ category: e.target.value })} />
            </Field>
          </>
        )}
        {sheet.kind === 'requirements' && (
          <Field label={m.importer.attachTo}>
            <select className="select" value={sheet.attachTo ?? ''} onChange={(e) => patchSheet({ attachTo: e.target.value || null })}>
              <option value="" />
              {productSheets.map((s) => (
                <option key={s.sheetName} value={s.sheetName}>
                  {s.projectName}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {sheet.kind === 'products' && existingNames.has(sheet.projectName.trim()) && <p className="muted small">{m.importer.existingName}</p>}

      {sheet.kind === 'products' && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>{m.importer.columns}</h3>
          <div className="map-scroll">
            <table className="map">
              <thead>
                <tr>
                  <th>{m.importer.column}</th>
                  <th>{m.importer.samples}</th>
                  <th>{m.importer.target}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sheet.columns.map((c) => (
                  <tr key={c.index} className={c.confident ? '' : 'unsure'}>
                    <td>
                      <b>{c.header}</b>
                      {!c.confident && (
                        <div className="small" style={{ color: 'var(--accent-text)' }}>
                          {m.importer.check}
                        </div>
                      )}
                    </td>
                    <td className="samples" title={c.samples.join(' · ')}>
                      {c.samples.join(' · ')}
                    </td>
                    <td style={{ minWidth: 200 }}>
                      <select
                        className="select"
                        value={c.target}
                        aria-label={`${m.importer.target}: ${c.header}`}
                        onChange={(e) =>
                          setColumn(c.index, { target: e.target.value as FieldTarget, person: c.person || (e.target.value === 'personNote' ? c.header : '') })
                        }
                      >
                        {FIELD_TARGETS.map((t) => (
                          <option key={t} value={t}>
                            {m.importer.target_[t]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ minWidth: 280 }}>
                      {c.target === 'property' && (
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          <input
                            className="input"
                            value={c.propertyName}
                            aria-label={m.field.name}
                            onChange={(e) => setColumn(c.index, { propertyName: e.target.value })}
                          />
                          <select
                            className="select"
                            value={c.propertyType}
                            aria-label={m.field.type}
                            onChange={(e) => setColumn(c.index, { propertyType: e.target.value as PropertyType })}
                            style={{ width: 120 }}
                          >
                            {PROPERTY_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {m.propertyType[t]}
                              </option>
                            ))}
                          </select>
                          {c.propertyType === 'number' && (
                            <input
                              className="input"
                              value={c.unit}
                              placeholder={m.field.unit}
                              aria-label={m.field.unit}
                              onChange={(e) => setColumn(c.index, { unit: e.target.value })}
                              style={{ width: 70 }}
                            />
                          )}
                        </div>
                      )}
                      {c.target === 'personNote' && (
                        <input
                          className="input"
                          value={c.person}
                          placeholder={m.importer.person}
                          aria-label={m.importer.person}
                          list="import-people"
                          onChange={(e) => setColumn(c.index, { person: e.target.value })}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="import-people">
              {people.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        </div>
      )}

      {sheet.kind === 'requirements' && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>{m.importer.columns}</h3>
          <table className="map">
            <tbody>
              {sheet.reqColumns
                .filter((c) => c.header)
                .map((c) => (
                  <tr key={c.index}>
                    <td>
                      <b>{c.header}</b>
                    </td>
                    <td>
                      <select
                        className="select"
                        value={c.target}
                        onChange={(e) => {
                          const next = {
                            ...sheet,
                            reqColumns: sheet.reqColumns.map((x) => (x.index === c.index ? { ...x, target: e.target.value as ReqTarget } : x)),
                          }
                          replaceSheet({ ...next, requirements: rereadRequirements(draft, next) })
                        }}
                      >
                        {(Object.keys(m.importer.reqTarget) as ReqTarget[]).map((t) => (
                          <option key={t} value={t}>
                            {m.importer.reqTarget[t]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {sheet.requirements.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>{m.importer.requirementsFound(sheet.requirements.length)}</h3>
          <div className="map-scroll">
            <table className="map">
              <tbody>
                {sheet.requirements.map((r, i) => (
                  <tr key={i}>
                    <td style={{ width: 28 }}>
                      <input
                        type="checkbox"
                        aria-label={r.label}
                        checked={r.include}
                        onChange={(e) => patchSheet({ requirements: sheet.requirements.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })}
                      />
                    </td>
                    <td style={{ width: 140 }}>
                      <select
                        className="select"
                        value={r.priority}
                        aria-label={m.field.priority}
                        onChange={(e) =>
                          patchSheet({ requirements: sheet.requirements.map((x, j) => (j === i ? { ...x, priority: e.target.value as Priority } : x)) })
                        }
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {m.priority[p]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {r.category && <span className="muted">{r.category} · </span>}
                      <b>{r.label}</b>
                      {r.description && <div className="muted small">{r.description}</div>}
                    </td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>
                      {r.condition && (
                        <span className="pill pass">
                          {r.condition.propertyName ?? m.field.price} {OP_SYMBOL[r.condition.op]} {r.condition.value}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sheet.notes && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>{m.importer.notesFound}</h3>
          <div className="pre">{sheet.notes}</div>
        </div>
      )}

      {sheet.kind === 'products' && preview.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>{m.importer.preview(preview.length)}</h3>
          <div className="map-scroll">
            <table className="map">
              <thead>
                <tr>
                  <th>{m.field.product}</th>
                  <th className="num">{m.field.price}</th>
                  <th>{m.field.candidate}</th>
                  <th>{m.field.purchaseStatus}</th>
                  <th>{m.field.url}</th>
                  <th className="num">{m.product.properties}</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 60).map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td className="num">{p.price}</td>
                    <td>
                      {p.candidate === 'excluded' ? (
                        <span className="pill excl">{m.candidate.excluded}</span>
                      ) : p.favorite ? (
                        <span className="pill fav">★ {m.verdict.favorite}</span>
                      ) : null}
                    </td>
                    <td>{p.purchased ? m.purchase.purchased : ''}</td>
                    <td className="samples">{p.url ? '✓' : ''}</td>
                    <td className="num">{p.propertyCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
