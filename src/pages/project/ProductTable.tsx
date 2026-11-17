import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { reorder, setProductValue, updateProduct, updateProject } from '../../db/repo'
import type { Candidate, Product, PropertyDef, TableView } from '../../db/types'
import { avgStars, compareKeys, formatValue, productName, sortKey } from '../../domain/display'
import { coerceValue, hostOf, isTyped, parseNumber, safeHref } from '../../domain/values'
import { useI18n } from '../../i18n'
import { ImageError, loadImages, missingImages, productImage } from '../../images'
import { useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { CheckStrip, Stars, Verdict } from '../../ui/Marks'
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

export function ProductTable({
  data,
  selection,
  setSelection,
  onOpen,
}: {
  data: ProjectData
  selection: Set<string>
  setSelection: (s: Set<string>) => void
  onOpen: (id: string) => void
}) {
  const { m, fmt } = useI18n()
  const navigate = useNavigate()
  const { project, products, properties } = data
  const view = project.tableView
  const [filter, setFilter] = useState('')
  const [onlyEligible, setOnlyEligible] = useState(false)
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

  const saveView = (patch: Partial<TableView>) => updateProject(project.id, { tableView: { ...view, ...patch } })

  // Price context for "cheapest / +x" hints.
  const activePrices = products.filter((p) => p.candidate !== 'excluded' && p.price !== null).map((p) => p.price!)
  const minPrice = activePrices.length > 1 ? Math.min(...activePrices) : null

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
        render: (p) => (
          <EditableCell
            kind="number"
            label={m.field.price}
            value={p.price !== null ? String(p.price) : ''}
            onCommit={(v) => {
              const n = parseNumber(v)
              void updateProduct(p, n === null && v.trim() ? { price: null, priceNote: v.trim() } : { price: n })
            }}
            display={
              <span className="price-cell" style={{ padding: 0, minHeight: 0 }}>
                <span className="price">{p.price !== null ? fmt.money(p.price) : p.priceNote}</span>
                {p.price !== null && minPrice !== null && p.candidate !== 'excluded' && (
                  <span className={`delta${p.price === minPrice ? ' best' : ''}`}>
                    {p.price === minPrice ? m.project.cheapest : m.project.priceDiff(fmt.money(p.price - minPrice))}
                  </span>
                )}
              </span>
            }
          />
        ),
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
        width: Math.min(Math.max(120, data.checkable.length * 11 + 30), 260),
        sort: (p) => {
          const s = data.summaries.get(p.id)!
          return (s.blocked ? 0 : s.qualified ? 2000 : 1000) + s.pass
        },
        render: (p) => (
          <span className="check-cell">
            <Verdict summary={data.summaries.get(p.id)!} />
            <CheckStrip items={data.results(p)} />
          </span>
        ),
      })
    }
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
      textCol(
        'exclusionReason',
        m.field.exclusionReason,
        200,
        (p) => p.exclusionReason,
        (p, v) => updateProduct(p, { exclusionReason: v }),
        true,
        true,
      ),
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
  }, [m, fmt, properties, data, minPrice, onOpen, users])

  const visibleCols = columns.filter((c) => !view.hiddenColumns.includes(c.id) && (!c.optional || products.some((p) => c.has!(p))))
  const hideableCols = columns.filter((c) => !c.optional || products.some((p) => c.has!(p)))

  // ---- filter & sort ----
  const q = filter.trim().toLowerCase()
  let rows = products.filter((p) => {
    if (view.hideExcluded && p.candidate === 'excluded') return false
    if (onlyEligible && (data.summaries.get(p.id)?.blocked || p.candidate === 'excluded')) return false
    if (!q) return true
    const hay = [p.brand, p.model, p.retailer, p.comments, p.productType, p.variant, ...Object.values(p.values).map(String)].join(' ').toLowerCase()
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
        <label className="check">
          <input type="checkbox" checked={view.hideExcluded} onChange={(e) => saveView({ hideExcluded: e.target.checked })} />
          {m.project.hideExcluded}
        </label>
        {data.checkable.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)} />
            {m.project.onlyEligible}
          </label>
        )}
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
            hideableCols.map((c) => (
              <label key={c.id}>
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
            ))
          }
        </Menu>
      </div>

      {products.length === 0 ? (
        <div className="empty stack">
          <p>{m.project.emptyProducts}</p>
          <QuickAdd data={data} onOpen={onOpen} inline />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <colgroup>
              <col style={{ width: 64 }} />
              <col style={{ width: widthOf('name', showThumbs ? 300 : 260) }} />
              {visibleCols.map((c) => (
                <col key={c.id} style={{ width: widthOf(c.id, c.width) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
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
                    align={c.align}
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
                          aria-label={m.reorder.handle(productName(p, m.product.unnamed))}
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
                          aria-label={`${m.project.selectRow}: ${productName(p, m.product.unnamed)}`}
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
                            alt={productName(p, m.product.unnamed)}
                            onClick={() => onOpen(p.id)}
                            label={`${m.project.details}: ${productName(p, m.product.unnamed)}`}
                          />
                        )}
                        <div className="name-main">
                          {p.brand && <div className="name-brand">{p.brand}</div>}
                          {href ? (
                            <a className="name-model" href={href} target="_blank" rel="noopener noreferrer" title={m.common.openLink}>
                              {p.model || p.brand || hostOf(p.url) || m.product.unnamed}
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="name-model"
                              style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                              onClick={() => onOpen(p.id)}
                            >
                              {p.model || (p.brand ? '' : m.product.unnamed)}
                            </button>
                          )}
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
                          <button
                            type="button"
                            className="icon-btn sm"
                            aria-label={`${m.project.details}: ${productName(p, m.product.unnamed)}`}
                            title={m.project.details}
                            onClick={() => onOpen(p.id)}
                          >
                            <Glyph name="panel" />
                          </button>
                        </div>
                      </div>
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.id} style={c.align ? { textAlign: c.align } : undefined}>
                        {c.render(p)}
                      </td>
                    ))}
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
        </div>
      )}
    </>
  )
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
  align,
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
  align?: 'right' | 'center'
}) {
  const { m } = useI18n()
  const [active, setActive] = useState(false)
  const dir = sort?.column === id ? sort.dir : null
  return (
    <th className={className} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}>
      <div className="th-inner">
        <button
          type="button"
          className="th-sort"
          onClick={() => onSort(id)}
          title={m.project.sortBy(label)}
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
        <span
          className={`resizer${active ? ' active' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={m.project.resizeColumn}
          title={m.project.resizeColumn}
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
              onResizeEnd(last)
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
        {v === true && <span className="bool yes">{m.common.yes}</span>}
        {v === false && <span className="bool no">{m.common.no}</span>}
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
