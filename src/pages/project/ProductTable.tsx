import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { deleteProduct, reorder, setProductValue, updateProduct, updateProject } from '../../db/repo'
import type { Candidate, Product, PropertyDef, Requirement, TableView } from '../../db/types'
import { avgStars, compareKeys, displayName, exclusionText, formatValue, isNew, productName, sortKey } from '../../domain/display'
import { cellCheck, OP_SYMBOL, requirementsByColumn, WEIGHT } from '../../domain/requirements'
import { priceHint, type PriceHint } from '../../domain/offers'
import { compileQuery } from '../../domain/query'
import { queryFields } from '../../domain/query-fields'
import { useSession } from '../../session'
import { reviewSummary } from '../../domain/reviews'
import { coerceValue, daysSince, hostOf, isTyped, parseNumber, safeHref, STALE_DAYS } from '../../domain/values'
import { useI18n, type Formatters } from '../../i18n'
import type { Messages } from '../../i18n/en'
import { applyProductPage, ImageError, loadImages, missingImages, productImage, readProductPage } from '../../images'
import { useConfirm, useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { CheckMark, RequirementBars, Stars } from '../../ui/Marks'
import { Menu } from '../../ui/Menu'
import { Thumb } from '../../ui/Thumb'
import { useUsers } from '../../users'
import { EditableCell } from './EditableCell'
import { QuickAdd } from './QuickAdd'
import type { ProjectData } from './useProjectData'

interface Col {
  id: string
  label: string
  unit?: string
  width: number
  /** Optional columns are hidden automatically while no product has a value. */
  optional?: boolean
  has?: (p: Product) => boolean
  sort: (p: Product) => number | string | null
  render: (p: Product) => ReactNode
  align?: 'right' | 'center'
}

/** Appends a field to a query, quoted when it has spaces or signs: `… AND "Offene Mitte" `. */
function addClause(query: string, name: string): string {
  const field = /^[\p{L}\p{N}_.-]+$/u.test(name) ? name : `"${name.replace(/"/g, '')}"`
  return `${query.trim() ? `${query.trim()} AND ` : ''}${field} `
}

/** Narrowest and widest width a column gets from double-clicking its edge. */
const MIN_COL = 60
const MAX_FIT = 360

export function ProductTable({
  data,
  selection,
  setSelection,
  onOpen,
  canEdit = true,
}: {
  data: ProjectData
  selection: Set<string>
  setSelection: (s: Set<string>) => void
  onOpen: (id: string) => void
  /** Viewers can select and compare, but not update or delete. */
  canEdit?: boolean
}) {
  const { m, fmt } = useI18n()
  const navigate = useNavigate()
  const { project, products, properties } = data
  const view = project.tableView
  const [filter, setFilter] = useState('')
  // Filters live in the address, so a filtered view can be reloaded and shared:
  // `chips` are the quick toggles, `q` the advanced query (src/domain/query.ts).
  const [params, setParams] = useSearchParams()
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  const chips = new Set((params.get('chips') ?? '').split(',').filter(Boolean))
  const toggleChip = (c: string) => {
    const next = new Set(chips)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    setParam('chips', [...next].join(','))
  }
  const onlyEligible = chips.has('eligible')
  const query = params.get('q') ?? ''
  const [advanced, setAdvanced] = useState(!!query)
  const session = useSession()
  const me = session.state.status === 'signed-in' ? session.state.user.name : ''
  const fields = useMemo(() => queryFields(properties, (p) => data.summaries.get(p.id), me), [properties, data.summaries, me])
  const compiled = useMemo(() => compileQuery<Product>(query, fields), [query, fields])
  /** Columns filtered by their requirements' verdict (the values themselves stay as they are). */
  const [reqFilter, setReqFilter] = useState<Record<string, 'pass' | 'fail'>>({})
  const byColumn = useMemo(() => requirementsByColumn(data.rules), [data.rules])
  const tableRef = useRef<HTMLTableElement>(null)
  const [widths, setWidths] = useState<Record<string, number>>({})
  const toast = useToast()
  const users = useUsers()

  // ---- product images ----
  const showThumbs = products.some((p) => productImage(p))
  // Products already tried in this session are not offered again (most failures are shops refusing automated access).
  const [tried, setTried] = useState<Set<string>>(() => new Set())
  const missing = missingImages(products).filter((p) => !tried.has(p.id))
  const [imgProgress, setImgProgress] = useState<{ done: number; total: number } | null>(null)
  const loadAllImages = async () => {
    if (imgProgress) return
    setImgProgress({ done: 0, total: missing.length })
    try {
      const r = await loadImages(missing, (done, total) => setImgProgress({ done, total }))
      setTried(new Set([...tried, ...missing.map((p) => p.id)]))
      toast(m.image.bulkResult(r.loaded, r.failed.length))
    } catch (e) {
      toast(m.image.error[e instanceof ImageError ? e.code : 'failed'])
    } finally {
      setImgProgress(null)
    }
  }

  // ---- acting on the selected products ----
  const confirm = useConfirm()
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
  const selected = products.filter((p) => selection.has(p.id))
  /** One shop page after the other – no burst of requests to a shop. */
  const bulkUpdate = async () => {
    const withLink = selected.filter((p) => safeHref(p.url))
    if (!withLink.length) return toast(m.bulk.noLinks)
    let ok = 0
    let prices = 0
    let failed = 0
    setBulk({ done: 0, total: withLink.length })
    for (const [i, p] of withLink.entries()) {
      try {
        const filled = await applyProductPage(p, await readProductPage(p.url))
        ok++
        if (p.price !== null && filled.includes('price')) prices++
      } catch {
        failed++
      }
      setBulk({ done: i + 1, total: withLink.length })
    }
    setBulk(null)
    toast(m.bulk.updated(ok, prices, failed))
  }
  /** Deleting several products asks twice; the second time it names them. */
  const bulkDelete = async () => {
    const n = selected.length
    if (!(await confirm({ title: m.bulk.deleteTitle(n), text: m.bulk.deleteText, confirmLabel: m.bulk.delete, danger: true }))) return
    const names = selected.map((p) => displayName(p, m)).join(', ')
    if (!(await confirm({ title: m.bulk.deleteAgainTitle, text: m.bulk.deleteAgainText(names), confirmLabel: m.bulk.deleteFinal, danger: true }))) return
    for (const p of selected) await deleteProduct(p)
    setSelection(new Set())
    toast(m.bulk.deleted(n))
  }

  const saveView = (patch: Partial<TableView>) => updateProject(project.id, { tableView: { ...view, ...patch } })

  const columns: Col[] = useMemo(() => {
    const cols: Col[] = [
      {
        id: 'candidate',
        label: m.field.candidate,
        width: 128,
        sort: (p) => ({ favorite: 0, open: 1, excluded: 2 })[p.candidate],
        render: (p) => (
          <EditableCell
            kind="select"
            label={m.field.candidate}
            value={m.candidate[p.candidate]}
            options={[m.candidate.open, m.candidate.favorite, m.candidate.excluded]}
            display={
              <span className={`pill${p.candidate === 'favorite' ? ' fav' : p.candidate === 'excluded' ? ' excl' : ''}`}>{m.candidate[p.candidate]}</span>
            }
            onCommit={(v) => {
              const c = (Object.keys(m.candidate) as Candidate[]).find((k) => m.candidate[k] === v) ?? 'open'
              void updateProduct(p, { candidate: c })
            }}
          />
        ),
      },
      {
        id: 'price',
        label: m.field.price,
        width: 120,
        align: 'right',
        sort: (p) => p.price,
        render: (p) => {
          const note = priceNote(priceHint(p, products, project), m, fmt)
          const stale = p.price !== null && (daysSince(p.priceDate) ?? 0) > STALE_DAYS
          return (
            <EditableCell
              kind="number"
              label={m.field.price}
              value={p.price !== null ? String(p.price) : ''}
              spoken={[p.price !== null ? fmt.money(p.price) : p.priceNote, stale ? m.product.priceStale : '', note?.text ?? ''].filter(Boolean).join(' ')}
              onCommit={(v) => {
                const n = parseNumber(v)
                void updateProduct(p, n === null && v.trim() ? { price: null, priceNote: v.trim() } : { price: n })
              }}
              display={
                <span className="price-cell" style={{ padding: 0, minHeight: 0 }}>
                  <span className="price">
                    {stale && <span className="warn-dot" title={`${m.product.priceAsOf(fmt.date(p.priceDate))} · ${m.product.priceStale}`} />}
                    {p.price !== null ? fmt.money(p.price) : p.priceNote}
                  </span>
                  {note && ' '}
                  {note && <span className={`delta${note.tone ? ` ${note.tone}` : ''}`}>{note.text}</span>}
                </span>
              }
            />
          )
        },
      },
      {
        id: 'retailer',
        label: m.field.retailer,
        width: 140,
        sort: (p) => p.retailer.toLowerCase() || null,
        render: (p) => <EditableCell kind="text" label={m.field.retailer} value={p.retailer} onCommit={(v) => updateProduct(p, { retailer: v.trim() })} />,
      },
    ]
    if (data.checkable.length) {
      cols.push({
        id: 'checks',
        label: m.field.checks,
        width: 190,
        sort: (p) => {
          const s = data.summaries.get(p.id)!
          return (s.blocked ? 0 : s.qualified ? 2000 : 1000) + (s.fit ?? 0)
        },
        render: (p) => <RequirementBars summary={data.summaries.get(p.id)!} items={data.results(p)} />,
      })
    }
    if (data.checkable.some((r) => WEIGHT[r.priority])) {
      cols.push({
        id: 'fit',
        label: m.check.fit,
        width: 110,
        align: 'right',
        sort: (p) => data.summaries.get(p.id)!.fit,
        render: (p) => {
          const s = data.summaries.get(p.id)!
          const text = m.check.fitSummary(s.fit, s.fitOpen)
          return (
            <span className="fit-cell" title={`${m.check.fitHint} ${text}`}>
              <span aria-hidden="true">{s.fit !== null ? `${s.fit} %` : '–'}</span>
              {s.fitOpen > 0 && (
                <span className="muted small" aria-hidden="true">
                  {m.check.fitOpen(s.fitOpen)}
                </span>
              )}
              <span className="sr-only">{text}</span>
            </span>
          )
        },
      })
    }
    cols.push({
      id: 'reviews',
      label: m.review.column,
      width: 120,
      align: 'right',
      optional: true,
      has: (p) => reviewSummary(p.reviews, 'product').sources > 0,
      sort: (p) => reviewSummary(p.reviews, 'product').score,
      render: (p) => {
        const s = reviewSummary(p.reviews, 'product')
        if (!s.sources) return null
        return (
          <button type="button" className="cell fit-cell" onClick={() => onOpen(p.id)}>
            <span>{s.score}/100</span>
            <span className="muted small">{m.review.sources(s.sources)}</span>
          </button>
        )
      },
    })
    cols.push({
      id: 'votes',
      label: m.swipe.column,
      width: 110,
      optional: true,
      has: (p) => Object.keys(p.votes ?? {}).length > 0,
      sort: (p) => {
        const v = Object.values(p.votes ?? {})
        return v.length ? v.filter((x) => x === 'like').length - v.filter((x) => x === 'dislike').length : null
      },
      render: (p) => {
        const entries = Object.entries(p.votes ?? {})
        const names = (vote: string) =>
          entries
            .filter(([, v]) => v === vote)
            .map(([id]) => users.get(id) ?? '?')
            .join(', ')
        const likes = entries.filter(([, v]) => v === 'like').length
        const dislikes = entries.length - likes
        if (!entries.length) return null
        return (
          <span className="votes" title={m.swipe.votes(names('like'), names('dislike'))}>
            {likes > 0 && (
              <span className="vote like">
                <Glyph name="star" /> {likes}
              </span>
            )}
            {dislikes > 0 && (
              <span className="vote dislike">
                <Glyph name="cross" /> {dislikes}
              </span>
            )}
            <span className="sr-only">{m.swipe.votes(names('like'), names('dislike'))}</span>
          </span>
        )
      },
    })
    cols.push({
      id: 'rating',
      label: m.project.avgRating,
      width: 110,
      optional: true,
      has: (p) => p.ratings.length > 0,
      sort: (p) => avgStars(p),
      render: (p) => {
        const a = avgStars(p)
        const note = p.ratings
          .filter((r) => r.note)
          .map((r) => `${r.person}: ${r.note}`)
          .join('\n')
        return (
          <button type="button" className="cell" onClick={() => onOpen(p.id)} title={note || undefined}>
            {a !== null ? <Stars value={Math.round(a)} label={m.field.rating} /> : note ? <span className="muted small">“{note.split('\n')[0]}”</span> : null}
          </button>
        )
      },
    })
    for (const prop of properties) cols.push(propertyColumn(prop))
    cols.push(
      textCol(
        'comments',
        m.field.comments,
        260,
        (p) => p.comments,
        (p, v) => updateProduct(p, { comments: v }),
        true,
        false,
      ),
      {
        id: 'exclusionReason',
        label: m.field.exclusionReason,
        width: 200,
        optional: true,
        has: (p) => !!(p.exclusionReason || p.exclusionCategory),
        sort: (p) => exclusionText(p, m).toLowerCase() || null,
        render: (p) => (
          <EditableCell
            kind="text"
            label={m.field.exclusionReason}
            value={p.exclusionReason}
            className="wrap"
            display={exclusionText(p, m)}
            onCommit={(v) => updateProduct(p, { exclusionReason: v })}
          />
        ),
      },
      textCol(
        'productType',
        m.field.productType,
        140,
        (p) => p.productType,
        (p, v) => updateProduct(p, { productType: v }),
        false,
        true,
      ),
      textCol(
        'variant',
        m.field.variant,
        140,
        (p) => p.variant,
        (p, v) => updateProduct(p, { variant: v }),
        false,
        true,
      ),
      textCol(
        'foundBy',
        m.field.foundBy,
        120,
        (p) => p.foundBy,
        (p, v) => updateProduct(p, { foundBy: v }),
        false,
        true,
      ),
      {
        // When the product was added; entries of the last days also get a blue stripe.
        id: 'foundOn',
        label: m.field.foundOn,
        width: 110,
        sort: (p) => p.createdAt,
        render: (p) => (
          <span className="cell static" title={fmt.dateTime(p.createdAt)}>
            {fmt.date(p.createdAt)}
            {isNew(p.createdAt) && <span className="sr-only">, {m.project.isNew}</span>}
          </span>
        ),
      },
      {
        id: 'purchase',
        label: m.field.purchaseDate,
        width: 130,
        optional: true,
        has: (p) => p.purchase.status !== 'none',
        sort: (p) => p.purchase.date || (p.purchase.status !== 'none' ? '0' : null),
        render: (p) => (
          <button type="button" className="cell" onClick={() => onOpen(p.id)}>
            {p.purchase.status === 'none' ? '' : p.purchase.date ? fmt.date(p.purchase.date) : m.purchase[p.purchase.status]}
          </button>
        ),
      },
    )
    return cols

    function textCol(
      id: string,
      label: string,
      width: number,
      get: (p: Product) => string,
      set: (p: Product, v: string) => void,
      long: boolean,
      optional: boolean,
    ): Col {
      return {
        id,
        label,
        width,
        optional,
        has: (p) => !!get(p),
        sort: (p) => get(p).toLowerCase() || null,
        render: (p) => (
          <EditableCell kind={long ? 'longtext' : 'text'} label={label} value={get(p)} className={long ? 'wrap' : ''} onCommit={(v) => set(p, v)} />
        ),
      }
    }

    function propertyColumn(prop: PropertyDef): Col {
      const isNum = prop.type === 'number' || prop.type === 'rating'
      return {
        id: `prop:${prop.id}`,
        label: prop.name,
        unit: prop.unit,
        width: prop.type === 'boolean' ? 90 : isNum ? 110 : prop.type === 'text' ? 180 : 140,
        align: isNum ? 'right' : prop.type === 'boolean' ? 'center' : undefined,
        sort: (p) => sortKey(p.values[prop.id]),
        render: (p) => <PropertyCell prop={prop} product={p} />,
      }
    }
  }, [m, fmt, properties, data, products, project, onOpen, users])

  // Column order chosen by dragging headers (or the arrows in the Columns menu).
  const ordered = useMemo(() => {
    const order = view.columnOrder ?? []
    const rank = (id: string) => {
      const i = order.indexOf(id)
      return i < 0 ? order.length : i
    }
    return columns
      .map((c, i) => ({ c, i }))
      .sort((a, b) => rank(a.c.id) - rank(b.c.id) || a.i - b.i)
      .map((x) => x.c)
  }, [columns, view.columnOrder])
  const visibleCols = ordered.filter((c) => !view.hiddenColumns.includes(c.id) && (!c.optional || products.some((p) => c.has!(p))))
  const hideableCols = ordered.filter((c) => !c.optional || products.some((p) => c.has!(p)))

  const moveColumn = (id: string, targetId: string, after: boolean) => {
    if (id === targetId) return
    const ids = ordered.map((c) => c.id).filter((x) => x !== id)
    ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, id)
    void saveView({ columnOrder: ids })
  }
  const moveColumnBy = (id: string, step: -1 | 1, among: Col[] = visibleCols) => {
    const i = among.findIndex((c) => c.id === id)
    const target = among[i + step]
    if (target) moveColumn(id, target.id, step === 1)
  }
  const [colDrag, setColDrag] = useState<{ id: string; target: string | null; after: boolean } | null>(null)
  const headRef = useRef<HTMLTableRowElement>(null)
  const colDragOver = (clientX: number, id: string) => {
    const ths = [...(headRef.current?.querySelectorAll<HTMLTableCellElement>('th[data-col]') ?? [])]
    for (const th of ths) {
      const r = th.getBoundingClientRect()
      if (clientX < r.left + r.width / 2) return setColDrag({ id, target: th.dataset.col!, after: false })
    }
    const last = ths[ths.length - 1]
    if (last) setColDrag({ id, target: last.dataset.col!, after: true })
  }

  // ---- filter & sort ----
  const q = filter.trim().toLowerCase()
  let rows = products.filter((p) => {
    if (view.hideExcluded && p.candidate === 'excluded') return false
    if (onlyEligible && (data.summaries.get(p.id)?.blocked || p.candidate === 'excluded')) return false
    if (chips.has('fav') && p.candidate !== 'favorite') return false
    if (chips.has('new') && !isNew(p.createdAt)) return false
    if (chips.has('mine') && (!me || p.foundBy !== me)) return false
    if (compiled.ok && !compiled.test(p)) return false
    for (const [col, want] of Object.entries(reqFilter)) {
      const reqs = byColumn.get(col)
      if (reqs && cellCheck(reqs, p, data.propMap) !== want) return false
    }
    if (!q) return true
    const hay = [p.brand, p.model, p.retailer, p.comments, p.productType, p.variant, exclusionText(p, m), ...Object.values(p.values).map(String)]
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
  if (view.sort) {
    const dir = view.sort.dir === 'asc' ? 1 : -1
    if (view.sort.column === 'name')
      rows = [...rows].sort((a, b) => compareKeys(productName(a, '').toLowerCase() || null, productName(b, '').toLowerCase() || null, dir))
    else {
      const col = columns.find((c) => c.id === view.sort!.column)
      if (col) rows = [...rows].sort((a, b) => compareKeys(col.sort(a), col.sort(b), dir))
    }
  }

  const toggleSort = (column: string) => {
    const s = view.sort
    const next: TableView['sort'] = !s || s.column !== column ? { column, dir: 'asc' } : s.dir === 'asc' ? { column, dir: 'desc' } : undefined
    void saveView({ sort: next })
  }

  const widthOf = (id: string, fallback: number) => widths[id] ?? view.columnWidths[id] ?? fallback

  /**
   * Double-click on a column's edge: the narrowest width that shows header and values in one
   * line. The browser lays the table out once without fixed widths and wrapping, the width is
   * read off, everything is put back – in the same frame, so nothing flickers. Long texts are
   * capped so they wrap readably instead of stretching the table.
   */
  const autoFit = (id: string) => {
    const table = tableRef.current
    const col = table?.querySelector<HTMLTableColElement>(`col[data-col="${CSS.escape(id)}"]`)
    const th = table?.querySelector<HTMLTableCellElement>(`th[data-fit="${CSS.escape(id)}"]`)
    if (!table || !col || !th) return
    const before = col.style.width
    table.classList.add('measuring')
    col.style.width = 'auto'
    const natural = Math.ceil(th.getBoundingClientRect().width)
    col.style.width = before
    table.classList.remove('measuring')
    const w = Math.max(MIN_COL, Math.min(MAX_FIT, natural))
    setWidths((s) => ({ ...s, [id]: w }))
    void saveView({ columnWidths: { ...view.columnWidths, [id]: w } })
  }

  /** "≤ 40" for the header of a column with requirement rules. */
  const ruleLabel = (reqs: Requirement[]) =>
    reqs.map((r) => `${OP_SYMBOL[r.condition!.op]}${r.condition!.value !== undefined ? ` ${r.condition!.value}` : ''}`).join(' · ')
  const cycleFilter = (col: string) =>
    setReqFilter((f) => {
      const next = { ...f }
      if (!f[col]) next[col] = 'pass'
      else if (f[col] === 'pass') next[col] = 'fail'
      else delete next[col]
      return next
    })

  const allSelected = rows.length > 0 && rows.every((r) => selection.has(r.id))

  // ---- moving rows (drag the handle, or arrow keys on it) ----
  // The table order is the stored order; while a column sorts the table, rows cannot be moved.
  const canMove = !view.sort
  const tbodyRef = useRef<HTMLTableSectionElement>(null)
  const [drag, setDrag] = useState<{ id: string; target: string | null; after: boolean } | null>(null)
  const moveTo = (id: string, targetId: string, after: boolean) => {
    if (id === targetId) return
    const moving = products.find((p) => p.id === id)
    if (!moving) return
    const list = products.filter((p) => p.id !== id)
    const idx = list.findIndex((p) => p.id === targetId) + (after ? 1 : 0)
    list.splice(idx, 0, moving)
    void reorder('products', list)
  }
  const dragOver = (clientY: number) => {
    if (!drag || !tbodyRef.current) return
    const trs = [...tbodyRef.current.querySelectorAll<HTMLTableRowElement>('tr[data-id]')]
    if (clientY < 48) window.scrollBy(0, -12)
    else if (clientY > window.innerHeight - 48) window.scrollBy(0, 12)
    for (const tr of trs) {
      const r = tr.getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return setDrag({ ...drag, target: tr.dataset.id!, after: false })
    }
    const last = trs[trs.length - 1]
    if (last) setDrag({ ...drag, target: last.dataset.id!, after: true })
  }
  const moveByKey = (p: Product, key: string) => {
    const i = rows.findIndex((r) => r.id === p.id)
    if (key === 'ArrowUp' && i > 0) moveTo(p.id, rows[i - 1].id, false)
    else if (key === 'ArrowDown' && i < rows.length - 1) moveTo(p.id, rows[i + 1].id, true)
    else return false
    return true
  }

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <label className="search">
          <Glyph name="search" />
          <span className="sr-only">{m.project.filterPlaceholder}</span>
          <input className="input" type="search" placeholder={m.project.filterPlaceholder} value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
        <div className="chips filter-chips" role="group" aria-label={m.filter.quick}>
          <button type="button" className="chip toggle" aria-pressed={chips.has('fav')} onClick={() => toggleChip('fav')}>
            {m.filter.fav}
          </button>
          <button type="button" className="chip toggle" aria-pressed={chips.has('new')} onClick={() => toggleChip('new')}>
            {m.filter.new}
          </button>
          {me && (
            <button type="button" className="chip toggle" aria-pressed={chips.has('mine')} onClick={() => toggleChip('mine')}>
              {m.filter.mine}
            </button>
          )}
          {data.checkable.length > 0 && (
            <button type="button" className="chip toggle" aria-pressed={onlyEligible} onClick={() => toggleChip('eligible')}>
              {m.project.onlyEligible}
            </button>
          )}
          <button type="button" className="chip toggle" aria-pressed={view.hideExcluded} onClick={() => saveView({ hideExcluded: !view.hideExcluded })}>
            {m.project.hideExcluded}
          </button>
          <button
            type="button"
            className="chip toggle advanced"
            aria-expanded={advanced}
            aria-controls="advanced-filter"
            onClick={() => setAdvanced(!advanced)}
          >
            {m.filter.advanced}
            {query && !advanced ? ' •' : ''}
          </button>
        </div>
        <span className="spacer" />
        {(missing.length > 0 || imgProgress) && (
          <button type="button" className="btn sm" onClick={loadAllImages} disabled={!!imgProgress} aria-live="polite" title={m.image.loadAllHint}>
            <Glyph name="image" />
            {imgProgress ? m.image.loading(imgProgress.done, imgProgress.total) : m.image.loadAll(missing.length)}
          </button>
        )}
        <Menu
          label={m.project.columns}
          trigger={
            <>
              <Glyph name="columns" /> {m.project.columns}
            </>
          }
          className="btn sm"
          scroll
        >
          {() =>
            hideableCols.map((c, i) => (
              <div className="col-row" key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!view.hiddenColumns.includes(c.id)}
                    onChange={(e) =>
                      saveView({
                        hiddenColumns: e.target.checked ? view.hiddenColumns.filter((x) => x !== c.id) : [...view.hiddenColumns, c.id],
                      })
                    }
                  />
                  {c.label}
                </label>
                <button
                  type="button"
                  className="icon-btn sm"
                  disabled={i === 0}
                  aria-label={`${m.reorder.up}: ${c.label}`}
                  title={m.reorder.up}
                  onClick={() => moveColumnBy(c.id, -1, hideableCols)}
                >
                  <Glyph name="up" />
                </button>
                <button
                  type="button"
                  className="icon-btn sm"
                  disabled={i === hideableCols.length - 1}
                  aria-label={`${m.reorder.down}: ${c.label}`}
                  title={m.reorder.down}
                  onClick={() => moveColumnBy(c.id, 1, hideableCols)}
                >
                  <Glyph name="down" />
                </button>
              </div>
            ))
          }
        </Menu>
      </div>

      {advanced && (
        <div id="advanced-filter" className="advanced-filter">
          <label className="sr-only" htmlFor="filter-query">
            {m.filter.queryLabel}
          </label>
          <input
            id="filter-query"
            className="input mono"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder={m.filter.placeholder}
            spellCheck={false}
            autoComplete="off"
            maxLength={500}
            aria-invalid={!compiled.ok || undefined}
            aria-describedby="filter-status"
          />
          <p id="filter-status" className={`small ${compiled.ok ? 'muted' : 'filter-error'}`} role="status">
            {!compiled.ok
              ? m.filter.error(compiled.error.code, compiled.error.text, compiled.error.at + 1)
              : query.trim()
                ? m.filter.matches(rows.length, products.length)
                : m.filter.hint}
          </p>
          <details className="filter-help">
            <summary>{m.filter.helpTitle}</summary>
            <p className="small">{m.filter.helpSyntax}</p>
            {properties.length > 0 && (
              <>
                <p className="small muted">{m.filter.ownFields}</p>
                <div className="chips">
                  {properties.map((prop) => (
                    <button key={prop.id} type="button" className="chip" onClick={() => setParam('q', addClause(query, prop.name))}>
                      {prop.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="small muted">{m.filter.builtIn}</p>
            <p className="small muted">{m.filter.examplesTitle}</p>
            <div className="chips">
              {m.filter.examples.map((ex) => (
                <button key={ex} type="button" className="chip mono" onClick={() => setParam('q', ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}

      {products.length === 0 ? (
        <div className="empty stack">
          <p>{m.project.emptyProducts}</p>
          <QuickAdd data={data} onOpen={onOpen} inline />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid" ref={tableRef}>
            <colgroup>
              <col style={{ width: 64 }} />
              <col data-col="name" style={{ width: widthOf('name', showThumbs ? 300 : 260) }} />
              {visibleCols.map((c) => (
                <col key={c.id} data-col={c.id} style={{ width: widthOf(c.id, c.width) }} />
              ))}
            </colgroup>
            <thead>
              <tr ref={headRef}>
                <th className="sticky col-sel">
                  <span className="cell-sel">
                    <input
                      type="checkbox"
                      aria-label={m.project.selectToCompare}
                      checked={allSelected}
                      onChange={() => setSelection(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    />
                  </span>
                </th>
                <HeaderCell
                  id="name"
                  label={m.field.product}
                  className="sticky col-name"
                  sort={view.sort}
                  onSort={toggleSort}
                  width={widthOf('name', showThumbs ? 300 : 260)}
                  onResize={(w) => setWidths((s) => ({ ...s, name: w }))}
                  onResizeEnd={(w) => saveView({ columnWidths: { ...view.columnWidths, name: w } })}
                  onAutoFit={() => autoFit('name')}
                />
                {visibleCols.map((c) => (
                  <HeaderCell
                    key={c.id}
                    id={c.id}
                    label={c.label}
                    unit={c.unit}
                    sort={view.sort}
                    onSort={toggleSort}
                    width={widthOf(c.id, c.width)}
                    onResize={(w) => setWidths((s) => ({ ...s, [c.id]: w }))}
                    onResizeEnd={(w) => saveView({ columnWidths: { ...view.columnWidths, [c.id]: w } })}
                    onAutoFit={() => autoFit(c.id)}
                    align={c.align}
                    check={
                      byColumn.has(c.id)
                        ? {
                            rule: ruleLabel(byColumn.get(c.id)!),
                            labels: byColumn
                              .get(c.id)!
                              .map((r) => r.label)
                              .join(', '),
                            filter: reqFilter[c.id] ?? null,
                            onCycle: () => cycleFilter(c.id),
                          }
                        : undefined
                    }
                    move={{
                      dragging: colDrag?.id === c.id && !!colDrag.target,
                      drop: colDrag?.target === c.id && colDrag.id !== c.id ? (colDrag.after ? 'after' : 'before') : null,
                      onDrag: (x) => colDragOver(x, c.id),
                      onDrop: () => {
                        if (colDrag?.target) moveColumn(colDrag.id, colDrag.target, colDrag.after)
                        setColDrag(null)
                      },
                      onCancel: () => setColDrag(null),
                      onKey: (step) => moveColumnBy(c.id, step),
                    }}
                  />
                ))}
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {rows.map((p) => {
                const href = safeHref(p.url)
                const cls = [
                  selection.has(p.id) && 'is-selected',
                  p.candidate === 'favorite' && 'is-fav',
                  isNew(p.createdAt) && 'is-new',
                  p.candidate === 'excluded' && 'is-excluded',
                  project.decisionProductId === p.id && 'is-decision',
                  drag?.id === p.id && 'is-dragging',
                  drag && drag.target === p.id && drag.target !== drag.id && (drag.after ? 'drop-after' : 'drop-before'),
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <tr key={p.id} className={cls} data-id={p.id}>
                    <td className="sticky col-sel">
                      <span className="cell-sel">
                        <button
                          type="button"
                          className="grip"
                          disabled={!canMove}
                          aria-label={m.reorder.handle(displayName(p, m))}
                          title={canMove ? m.reorder.hint : m.reorder.sorted}
                          aria-keyshortcuts="ArrowUp ArrowDown"
                          onPointerDown={(e) => {
                            if (!canMove || e.button !== 0) return
                            e.preventDefault()
                            e.currentTarget.setPointerCapture(e.pointerId)
                            setDrag({ id: p.id, target: null, after: false })
                          }}
                          onPointerMove={(e) => dragOver(e.clientY)}
                          onPointerUp={() => {
                            if (drag?.target) moveTo(drag.id, drag.target, drag.after)
                            setDrag(null)
                          }}
                          onPointerCancel={() => setDrag(null)}
                          onKeyDown={(e) => {
                            if (canMove && moveByKey(p, e.key)) e.preventDefault()
                          }}
                        >
                          <Glyph name="grip" />
                        </button>
                        <input
                          type="checkbox"
                          aria-label={`${m.project.selectRow}: ${displayName(p, m)}`}
                          checked={selection.has(p.id)}
                          onChange={() => {
                            const next = new Set(selection)
                            if (next.has(p.id)) next.delete(p.id)
                            else next.add(p.id)
                            setSelection(next)
                          }}
                        />
                      </span>
                    </td>
                    <td className="sticky col-name">
                      <div className="name-cell">
                        {showThumbs && (
                          <Thumb
                            src={productImage(p)}
                            alt={displayName(p, m)}
                            onClick={() => onOpen(p.id)}
                            label={`${m.project.details}: ${displayName(p, m)}`}
                          />
                        )}
                        <div className="name-main">
                          {p.brand && <div className="name-brand">{p.brand}</div>}
                          <button type="button" className="name-model" onClick={() => onOpen(p.id)} title={m.project.details}>
                            {p.model || (p.brand ? '' : hostOf(p.url) || m.product.unnamed)}
                          </button>
                        </div>
                        <div className="name-tools">
                          <button
                            type="button"
                            className="icon-btn sm fav-toggle"
                            aria-pressed={p.candidate === 'favorite'}
                            aria-label={m.project.toggleFavorite}
                            title={m.project.toggleFavorite}
                            onClick={() => updateProduct(p, { candidate: p.candidate === 'favorite' ? 'open' : 'favorite' })}
                          >
                            <Glyph name="star" />
                          </button>
                          {href && (
                            <a
                              className="icon-btn sm"
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${m.product.openPage}: ${displayName(p, m)}`}
                              title={`${m.product.openPage} (${p.retailer || hostOf(p.url)})`}
                            >
                              <Glyph name="out" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    {visibleCols.map((c) => {
                      const reqs = byColumn.get(c.id)
                      const verdict = reqs ? cellCheck(reqs, p, data.propMap) : 'unknown'
                      return (
                        <td
                          key={c.id}
                          className={verdict !== 'unknown' ? `req-${verdict}` : undefined}
                          style={c.align ? { textAlign: c.align } : undefined}
                          title={reqs && verdict !== 'unknown' ? `${reqs.map((r) => r.label).join(', ')}: ${m.check[verdict]}` : undefined}
                        >
                          {c.render(p)}
                          {verdict !== 'unknown' && (
                            <span className="req-mark">
                              <span aria-hidden="true">{verdict === 'pass' ? '✓' : '✕'}</span>
                              <span className="sr-only">{m.check[verdict]}</span>
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="empty" style={{ border: 0 }}>
              {m.project.noMatch}
            </div>
          )}
        </div>
      )}

      {selection.size > 0 && (
        <div className="compare-bar" role="region" aria-label={m.compare.title}>
          <span>{m.project.selected(selection.size)}</span>
          <button className="btn ghost sm" onClick={() => setSelection(new Set())}>
            {m.project.clearSelection}
          </button>
          <button className="btn sm" disabled={selection.size < 2} onClick={() => navigate(`/p/${project.id}/compare?ids=${[...selection].join(',')}`)}>
            {m.project.compare(selection.size)}
          </button>
          {canEdit && (
            <>
              <button className="btn sm outline" disabled={!!bulk} onClick={bulkUpdate} aria-live="polite" title={m.pageUpdate.hint}>
                <Glyph name="download" /> {bulk ? m.bulk.updating(bulk.done, bulk.total) : m.bulk.update}
              </button>
              <button className="btn sm outline" disabled={!!bulk} onClick={bulkDelete}>
                <Glyph name="trash" /> {m.bulk.delete}
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}

/** The note under a price – against the reference product, the budget or the cheapest – and its tone. */
function priceNote(hint: PriceHint, m: Messages, fmt: Formatters): { text: string; tone: '' | 'best' | 'over' | 'ref' } | null {
  if (!hint) return null
  const signed = (d: number) => (d > 0 ? `+${fmt.money(d)}` : d < 0 ? `−${fmt.money(-d)}` : '±0')
  switch (hint.kind) {
    case 'reference':
      return { text: m.priceRef.reference, tone: 'ref' }
    case 'vsReference':
      return { text: m.priceRef.vs(signed(hint.diff)), tone: hint.diff < 0 ? 'best' : hint.diff > 0 ? 'over' : '' }
    case 'underBudget':
      return { text: m.budget.under(fmt.money(hint.diff)), tone: 'best' }
    case 'atBudget':
      return { text: m.budget.at, tone: 'best' }
    case 'overBudget':
      return { text: m.budget.over(fmt.money(hint.diff)), tone: 'over' }
    case 'cheapest':
      return { text: m.project.cheapest, tone: 'best' }
    case 'vsCheapest':
      return { text: m.project.priceDiff(fmt.money(hint.diff)), tone: '' }
  }
}

function HeaderCell({
  id,
  label,
  unit,
  className = '',
  sort,
  onSort,
  width,
  onResize,
  onResizeEnd,
  onAutoFit,
  align,
  move,
  check,
}: {
  id: string
  label: string
  unit?: string
  className?: string
  sort: TableView['sort']
  onSort: (id: string) => void
  width: number
  onResize: (w: number) => void
  onResizeEnd: (w: number) => void
  onAutoFit: () => void
  align?: 'right' | 'center'
  /** The column carries requirement rules: shown as "≤ 40", a click filters by their verdict. */
  check?: { rule: string; labels: string; filter: 'pass' | 'fail' | null; onCycle: () => void }
  /** Columns that can move: drag the header sideways, or Alt+←/→ on it. */
  move?: {
    dragging: boolean
    drop: 'before' | 'after' | null
    onDrag: (clientX: number) => void
    onDrop: () => void
    onCancel: () => void
    onKey: (step: -1 | 1) => void
  }
}) {
  const { m } = useI18n()
  const [active, setActive] = useState(false)
  // A press becomes a drag only after a few pixels; a plain click still sorts.
  const press = useRef<{ x: number; dragged: boolean } | null>(null)
  const dir = sort?.column === id ? sort.dir : null
  const cls = [className, move?.dragging && 'col-dragging', move?.drop && `col-drop-${move.drop}`].filter(Boolean).join(' ')
  return (
    <th className={cls} data-col={move ? id : undefined} data-fit={id} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
      <div className="th-inner">
        <button
          type="button"
          className={`th-sort${move ? ' movable' : ''}`}
          onClick={() => {
            if (press.current?.dragged) return
            onSort(id)
          }}
          onPointerDown={(e) => {
            if (!move || e.button !== 0) return
            press.current = { x: e.clientX, dragged: false }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!move || !press.current) return
            if (!press.current.dragged && Math.abs(e.clientX - press.current.x) < 6) return
            press.current.dragged = true
            move.onDrag(e.clientX)
          }}
          onPointerUp={() => {
            if (move && press.current?.dragged) move.onDrop()
            // Keep the flag until the click that follows this pointerup has been ignored.
            setTimeout(() => (press.current = null), 0)
          }}
          onPointerCancel={() => {
            press.current = null
            move?.onCancel()
          }}
          onKeyDown={(e) => {
            if (!move || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
            e.preventDefault()
            move.onKey(e.key === 'ArrowLeft' ? -1 : 1)
          }}
          aria-keyshortcuts={move ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
          title={move ? `${m.project.sortBy(label)} · ${m.reorder.columnHint}` : m.project.sortBy(label)}
          style={align === 'right' ? { justifyContent: 'flex-end' } : undefined}
        >
          <span>
            {label}
            {unit && <span className="unit"> ({unit})</span>}
          </span>
          {dir && (
            <span className="dir" aria-hidden="true">
              {dir === 'asc' ? '↑' : '↓'}
            </span>
          )}
        </button>
        {check && (
          <button
            type="button"
            className={`th-rule${check.filter ? ` on ${check.filter}` : ''}`}
            onClick={check.onCycle}
            aria-label={m.check.filterRule(check.rule, check.labels, check.filter)}
            title={m.check.filterRule(check.rule, check.labels, check.filter)}
          >
            {/* Just a mark to save width; the rule itself is in the tooltip and the accessible name. */}
            <span aria-hidden="true">*{check.filter === 'pass' ? '✓' : check.filter === 'fail' ? '✕' : ''}</span>
          </button>
        )}
        <span
          className={`resizer${active ? ' active' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={m.project.resizeColumn}
          title={`${m.project.resizeColumn} · ${m.project.autoFitHint}`}
          onDoubleClick={onAutoFit}
          onPointerDown={(e) => {
            e.preventDefault()
            const startX = e.clientX
            const startW = width
            let last = startW
            setActive(true)
            const move = (ev: PointerEvent) => {
              last = Math.max(60, Math.min(800, startW + ev.clientX - startX))
              onResize(last)
            }
            const up = () => {
              setActive(false)
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
              // A plain click (also each half of a double-click) changes nothing.
              if (last !== startW) onResizeEnd(last)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
          }}
        />
      </div>
    </th>
  )
}

export function PropertyCell({ prop, product }: { prop: PropertyDef; product: Product }) {
  const { m, fmt } = useI18n()
  const v = product.values[prop.id]
  const typed = v === undefined || isTyped(prop, v)
  const commit = (text: string) => {
    const c = coerceValue(prop.type, text)
    void setProductValue(product, prop.id, c.value)
  }
  if (prop.type === 'boolean' && typed) {
    const next = v === true ? false : v === false ? null : true
    return (
      <button
        type="button"
        className="cell bool-cell"
        onClick={() => setProductValue(product, prop.id, next)}
        aria-label={`${prop.name}: ${formatValue(prop, v, m, fmt) || '—'}`}
      >
        {v === true && <CheckMark result="pass" label={m.common.yes} />}
        {v === false && <CheckMark result="fail" label={m.common.no} />}
      </button>
    )
  }
  if (prop.type === 'rating' && typed) {
    return (
      <span className="cell" style={{ cursor: 'default' }}>
        <Stars value={typeof v === 'number' ? v : null} onChange={(n) => setProductValue(product, prop.id, n)} label={prop.name} />
      </span>
    )
  }
  if (prop.type === 'url' && v) {
    const href = safeHref(String(v))
    return (
      <EditableCell
        kind="url"
        label={prop.name}
        value={String(v)}
        onCommit={commit}
        display={
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {hostOf(String(v)) || String(v)}
            </a>
          ) : (
            String(v)
          )
        }
      />
    )
  }
  const kind =
    prop.type === 'select'
      ? 'select'
      : prop.type === 'date'
        ? 'date'
        : prop.type === 'number'
          ? 'number'
          : prop.type === 'url'
            ? 'url'
            : prop.type === 'text'
              ? 'longtext'
              : 'text'
  return (
    <EditableCell
      kind={typed ? kind : 'text'}
      label={prop.name}
      value={v === undefined || v === null ? '' : String(v)}
      options={prop.options}
      raw={!typed}
      className={`${prop.type === 'number' ? 'num' : ''}${prop.type === 'text' ? ' wrap' : ''}`}
      display={typed ? formatValue(prop, v, m, fmt) : <span title={m.product.rawValue}>{String(v)}</span>}
      onCommit={commit}
    />
  )
}
