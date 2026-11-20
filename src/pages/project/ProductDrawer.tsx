import { useEffect, useRef, useState } from 'react'
import { deleteProduct, duplicateProduct, setDecision, updateProduct, updateProject } from '../../db/repo'
import { EXCLUSION_CATEGORIES, STATUSES, type ExclusionCategory, type Product, type PurchaseStatus } from '../../db/types'
import { displayName } from '../../domain/display'
import { lookupLinks } from '../../domain/lookup'
import { evaluate, OP_SYMBOL } from '../../domain/requirements'
import { daysSince, hostOf, normalizeUrl, parseNumber, safeHref, STALE_DAYS } from '../../domain/values'
import { isValidGtin, normalizeGtin } from '../../shared/product-facts.ts'
import { useSettings } from '../../hooks'
import { useI18n } from '../../i18n'
import { Modal, useConfirm } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { CommitInput, CommitTextarea, Field } from '../../ui/inputs'
import { CheckMark, PriorityTag, Stars } from '../../ui/Marks'
import { PropertyCell } from './ProductTable'
import { ProductImage } from './ProductImage'
import { OffersSection, ReviewsSection } from './SourcesSections'
import { usePageUpdate } from './usePageUpdate'
import { withPurchaseDate } from '../../domain/purchase'
import { loadProductImage } from '../../images'
import type { ProjectData } from './useProjectData'
import { FavoriteToggle, VerdictCell } from './Verdict'
import { Menu } from '../../ui/Menu'
import { meaning } from '../../domain/page-import'
import { statusOf, statusPatch } from '../../domain/verdict'

export function ProductDrawer({
  data,
  productId,
  onClose,
  order = [],
  onStep,
}: {
  data: ProjectData
  productId: string | null
  onClose: () => void
  /** Product ids in the table's order (filtered and sorted): what ‹ › and swiping step through. */
  order?: string[]
  onStep?: (id: string) => void
}) {
  const product = productId ? data.products.find((p) => p.id === productId) : undefined
  const index = product ? order.indexOf(product.id) : -1
  /** Set when the details moved to another product, so its name gets the focus. */
  const stepped = useRef(false)
  if (!product) stepped.current = false
  const step: Step | undefined =
    product && onStep && index >= 0 && order.length > 1
      ? {
          index,
          total: order.length,
          prev: index > 0 ? order[index - 1] : null,
          next: index < order.length - 1 ? order[index + 1] : null,
          go: (id) => {
            stepped.current = true
            onStep(id)
          },
        }
      : undefined
  return (
    <Modal open={!!product} onClose={onClose} className="drawer" labelledBy="drawer-title">
      {/* Keyed by product: a step starts at the top, with fresh state. */}
      {product && <DrawerContent key={product.id} data={data} product={product} onClose={onClose} step={step} focusTitle={stepped.current} />}
    </Modal>
  )
}

interface Step {
  index: number
  total: number
  prev: string | null
  next: string | null
  go: (id: string) => void
}

const DIMS = ['width', 'height', 'depth'] as const

/** Typing, choosing or a scrolling strip: there arrow keys and swipes belong to the element. */
const ownsArrows = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('input, textarea, select, [contenteditable], .table-wrap, .entry, .menu-list, dialog.gallery, .pimg-stage')

function DrawerContent({
  data,
  product: p,
  onClose,
  step,
  focusTitle,
}: {
  data: ProjectData
  product: Product
  onClose: () => void
  step?: Step
  focusTitle?: boolean
}) {
  const { m, fmt } = useI18n()
  const confirm = useConfirm()
  const settings = useSettings()
  const { project } = data
  const isDecision = project.decisionProductId === p.id
  const href = safeHref(p.url)
  const set = (patch: Partial<Product>) => updateProduct(p, patch)
  const name = displayName(p, m)
  const title = useRef<HTMLHeadingElement>(null)
  const go = (id: string | null | undefined) => {
    if (id && step) step.go(id)
  }

  // ← → step to the previous / next product – unless a field or another dialog has them.
  useEffect(() => {
    if (!step) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (ownsArrows(e.target) || document.querySelectorAll('dialog[open]').length > 1) return
      e.preventDefault()
      go(e.key === 'ArrowLeft' ? step.prev : step.next)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
  // After a step, the new product's name is focused, so screen readers announce it.
  useEffect(() => {
    if (focusTitle) title.current?.focus()
  }, [focusTitle])

  // Swipe left / right on a phone: next / previous product.
  const touch = useRef<{ x: number; y: number; own: boolean } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touch.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, own: ownsArrows(e.target) } : null
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    if (!start || start.own || !step) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) > 70 && Math.abs(dx) > 1.6 * Math.abs(dy)) go(dx < 0 ? step.next : step.prev)
  }
  const pageUpdate = usePageUpdate(data.properties)
  const [updating, setUpdating] = useState(false)
  const lookups = lookupLinks(p)
  const priceAge = p.price !== null ? daysSince(p.priceDate) : null
  const gtinInvalid = !!p.gtin && !isValidGtin(p.gtin)
  /** Width, height and depth, shown together on one line under the price. */
  const dimsFound = DIMS.map((d) => [d, data.properties.find((prop) => meaning(prop.name) === d)] as const).filter(([, prop]) => prop !== undefined)
  const dims = dimsFound.map(([, prop]) => prop!)

  return (
    <div className="drawer-inner" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="drawer-head">
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {(p.brand || isDecision || updating) && (
              <div className="drawer-kicker small">
                {p.brand && <span className="muted">{p.brand}</span>}
                {isDecision && (
                  <span className="decision-mark">
                    <Glyph name="flag" /> {m.product.markDecision}
                  </span>
                )}
                {updating && (
                  <span className="muted" role="status">
                    {m.product.updating}
                  </span>
                )}
              </div>
            )}
            <h2 id="drawer-title" ref={title} tabIndex={-1} style={{ overflowWrap: 'anywhere' }}>
              {p.model || name}
            </h2>
          </div>
          {step && (
            <div className="step-nav" role="group" aria-label={m.product.stepLabel}>
              <button className="icon-btn" disabled={!step.prev} onClick={() => go(step.prev)} aria-label={m.product.prev} title={`${m.product.prev} (←)`}>
                <Glyph name="chevronLeft" />
              </button>
              <span className="step-count" aria-live="polite">
                {m.product.position(step.index + 1, step.total)}
              </span>
              <button className="icon-btn" disabled={!step.next} onClick={() => go(step.next)} aria-label={m.product.next} title={`${m.product.next} (→)`}>
                <Glyph name="chevronRight" />
              </button>
            </div>
          )}
          <Menu label={m.common.more} trigger={<Glyph name="moreVertical" />}>
            {(close) => {
              const act = (job: () => unknown) => () => {
                close()
                void job()
              }
              return (
                <>
                  <button type="button" aria-pressed={isDecision} onClick={act(() => setDecision(project, isDecision ? null : p.id))}>
                    <Glyph name="flag" /> {isDecision ? m.product.unmarkDecision : m.product.markDecision}
                  </button>
                  {href && (
                    <button
                      type="button"
                      disabled={updating}
                      title={m.pageUpdate.hint}
                      onClick={act(async () => {
                        setUpdating(true)
                        try {
                          await pageUpdate(p)
                        } finally {
                          setUpdating(false)
                        }
                      })}
                    >
                      <Glyph name="download" /> {m.pageUpdate.button}
                    </button>
                  )}
                  {p.price !== null && (
                    <button
                      type="button"
                      title={m.priceRef.hint}
                      onClick={act(() => updateProject(project.id, { priceReference: project.priceReference === p.id ? '' : p.id }))}
                    >
                      <Glyph name="euro" /> {project.priceReference === p.id ? m.priceRef.unset : m.priceRef.set}
                    </button>
                  )}
                  <hr />
                  <button type="button" onClick={act(() => duplicateProduct(p))}>
                    <Glyph name="copy" /> {m.common.duplicate}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={act(async () => {
                      const ok = await confirm({ title: m.product.deleteTitle(name), text: m.product.deleteText, confirmLabel: m.common.delete, danger: true })
                      if (ok) {
                        onClose()
                        await deleteProduct(p)
                      }
                    })}
                  >
                    <Glyph name="trash" /> {m.common.delete}
                  </button>
                </>
              )
            }}
          </Menu>
          <button className="icon-btn" onClick={onClose} aria-label={m.common.close} title={m.common.close}>
            <Glyph name="close" />
          </button>
        </div>
        <div className="drawer-controls">
          <div className="seg" role="group" aria-label={m.field.candidate}>
            {STATUSES.map((c) => (
              <button key={c} aria-pressed={statusOf(p) === c} onClick={() => set(statusPatch(p, c))}>
                {m.candidate[c]}
              </button>
            ))}
          </div>
          <FavoriteToggle product={p} inDetails />
          <VerdictCell product={p} inDetails />
        </div>
      </div>

      <div className="drawer-body">
        {p.candidate === 'excluded' && (
          <div className="section">
            <ExclusionFields product={p} autoFocus />
          </div>
        )}

        <div className="section">
          <ProductImage product={p} name={name} />
          {/* What is compared first, each on one line: the price with its date, then the dimensions. */}
          <div className="key-facts">
            <div className="key-fact">
              {/* The € sits outside the label, so the field's name stays "Price". */}
              <label htmlFor="product-price">{m.field.price}</label>
              <span className="input-affix">
                <CommitInput
                  id="product-price"
                  className="input"
                  inputMode="decimal"
                  value={p.price !== null ? String(p.price) : ''}
                  aria-describedby={priceAge !== null ? 'price-date' : undefined}
                  onCommit={(v) => set({ price: parseNumber(v) })}
                />
                <span className="affix" aria-hidden="true">
                  €
                </span>
              </span>
              {priceAge !== null && (
                <small id="price-date" className={`field-note${priceAge > STALE_DAYS ? ' stale' : ''}`}>
                  {priceAge > STALE_DAYS && <span className="warn-dot" aria-hidden="true" />}
                  {m.product.priceAsOf(fmt.date(p.priceDate))}
                  {priceAge > STALE_DAYS && ` · ${m.product.priceStale}`}
                </small>
              )}
            </div>
            {dims.length > 0 && (
              <div className="key-fact">
                <span className="key-label">{m.product.dimensions}</span>
                <span className="dims">
                  {dimsFound.map(([d, prop], i) => (
                    <span key={prop!.id} className="dim">
                      {i > 0 && (
                        <span className="dim-x" aria-hidden="true">
                          ×
                        </span>
                      )}
                      {/* The letter is only seen; the field's own name says it to screen readers. */}
                      <span className="dim-letter" aria-hidden="true">
                        {m.product.dimLetter[d]}
                      </span>
                      <PropertyCell prop={prop!} product={p} />
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="section">
          <h3>{m.product.basics}</h3>
          <div className="grid-2">
            <Field label={m.field.brand}>
              <CommitInput className="input" value={p.brand} onCommit={(v) => set({ brand: v.trim() })} />
            </Field>
            <Field label={m.field.model}>
              <CommitInput className="input" value={p.model} onCommit={(v) => set({ model: v.trim() })} />
            </Field>
            <Field label={m.field.retailer}>
              <CommitInput className="input" value={p.retailer} onCommit={(v) => set({ retailer: v.trim() })} />
            </Field>
            <Field label={m.field.url}>
              <CommitInput
                className="input"
                type="url"
                value={p.url}
                onCommit={(v) => {
                  const url = normalizeUrl(v)
                  void set({ url, retailer: p.retailer || hostOf(url) })
                }}
              />
            </Field>
            <div className="field-stack">
              <Field label={m.field.gtin}>
                <CommitInput
                  className="input"
                  inputMode="numeric"
                  value={p.gtin ?? ''}
                  aria-invalid={gtinInvalid || undefined}
                  aria-describedby={gtinInvalid ? 'gtin-note' : undefined}
                  onCommit={(v) => set({ gtin: normalizeGtin(v) })}
                />
              </Field>
              {gtinInvalid && (
                <small id="gtin-note" className="field-note stale">
                  <span className="warn-dot" aria-hidden="true" />
                  {m.product.gtinInvalid}
                </small>
              )}
            </div>
            <Field label={m.field.mpn}>
              <CommitInput className="input" value={p.mpn ?? ''} maxLength={64} onCommit={(v) => set({ mpn: v.trim() })} />
            </Field>
            <Field label={m.field.productType}>
              <CommitInput className="input" value={p.productType} onCommit={(v) => set({ productType: v })} />
            </Field>
            <Field label={m.field.variant}>
              <CommitInput className="input" value={p.variant} onCommit={(v) => set({ variant: v })} />
            </Field>
            <Field label={m.field.foundBy}>
              <CommitInput className="input" list="people-list" value={p.foundBy} onCommit={(v) => set({ foundBy: v.trim() })} />
            </Field>
            <Field label={m.field.imageUrl}>
              <CommitInput
                className="input"
                type="url"
                value={p.imageUrl}
                onCommit={(v) => {
                  const imageUrl = normalizeUrl(v)
                  void set({ imageUrl })
                  // Keep a local copy when possible; otherwise the link is shown as is.
                  if (safeHref(imageUrl)) void loadProductImage({ ...p, imageUrl }, imageUrl).catch(() => {})
                }}
              />
            </Field>
          </div>
          <datalist id="people-list">
            {settings.people.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
          <Field label={m.field.description} hint={m.fieldHint.description}>
            <CommitTextarea className="textarea" value={p.description} onCommit={(v) => set({ description: v })} />
          </Field>
        </div>

        <OffersSection product={p} lookups={lookups} />
        <ReviewsSection product={p} lookups={lookups} />

        <div className="section">
          <h3>{m.product.properties}</h3>
          {data.properties.length === 0 ? (
            <p className="muted small">{m.product.noProperties}</p>
          ) : (
            <dl className="facts">
              {data.properties
                .filter((prop) => !dims.includes(prop))
                .map((prop) => (
                  <div key={prop.id} className="fact">
                    <dt>
                      {prop.name}
                      {prop.unit && <span> ({prop.unit})</span>}
                    </dt>
                    <dd>
                      <PropertyCell prop={prop} product={p} />
                    </dd>
                  </div>
                ))}
            </dl>
          )}
        </div>

        <div className="section">
          <h3>{m.product.requirements}</h3>
          {data.requirements.length === 0 ? (
            <p className="muted small">{m.product.noRequirements}</p>
          ) : (
            data.requirements
              .filter((r) => r.priority !== 'info')
              .map((r) => {
                const res = evaluate(r, p, data.propMap)
                const manual = p.checks[r.id]
                const cycle = () => {
                  const checks = { ...p.checks }
                  if (!manual) checks[r.id] = 'pass'
                  else if (manual === 'pass') checks[r.id] = 'fail'
                  else delete checks[r.id]
                  void set({ checks })
                }
                const prop = r.condition?.target.kind === 'property' ? data.propMap.get(r.condition.target.propertyId) : null
                return (
                  <div className="req-check" key={r.id}>
                    <button onClick={cycle} title={m.check.manualHint} aria-label={`${r.label}: ${m.check[res]}. ${m.check.manualHint}`}>
                      <CheckMark result={res} manual={!!manual} />
                    </button>
                    <span className="lbl">
                      {r.label}
                      {r.condition && (
                        <span className="muted small">
                          {' '}
                          · {r.condition.target.kind === 'price' ? m.field.price : prop?.name} {OP_SYMBOL[r.condition.op]} {r.condition.value ?? ''}
                        </span>
                      )}
                    </span>
                    <PriorityTag p={r.priority} />
                  </div>
                )
              })
          )}
        </div>

        <div className="section">
          <h3>{m.product.assessment}</h3>
          <div className="stack">
            {/* Stars per person were replaced by the verdicts; ratings from an import stay readable. */}
            {p.ratings.length > 0 && (
              <div>
                <p className="field-label">{m.verdict.oldRatings}</p>
                <ul className="old-ratings">
                  {p.ratings.map((r, i) => (
                    <li key={i}>
                      <span>{r.person || '—'}</span>
                      {r.stars !== null && <Stars value={r.stars} label={`${m.field.rating} ${r.person}`} />}
                      {r.note && <span className="muted">{r.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Field label={m.field.overall} hint={m.fieldHint.overall}>
              <CommitInput className="input" value={p.overall} onCommit={(v) => set({ overall: v })} />
            </Field>
            <div className="grid-2">
              <Field label={m.field.pros} hint={m.fieldHint.list}>
                <CommitTextarea className="textarea" value={p.pros} onCommit={(v) => set({ pros: v })} />
              </Field>
              <Field label={m.field.cons} hint={m.fieldHint.list}>
                <CommitTextarea className="textarea" value={p.cons} onCommit={(v) => set({ cons: v })} />
              </Field>
            </div>
            <Field label={m.field.comments} hint={m.fieldHint.comments}>
              <CommitTextarea className="textarea" value={p.comments} onCommit={(v) => set({ comments: v })} />
            </Field>
            {/* "Notes" duplicated the comments; it only shows while it still holds text, to move it over. */}
            {p.notes.trim() && (
              <div className="old-notes">
                <Field label={m.fieldHint.oldNotes} hint={m.fieldHint.oldNotesHint}>
                  <CommitTextarea className="textarea" value={p.notes} onCommit={(v) => set({ notes: v })} />
                </Field>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => set({ comments: [p.comments.trim(), p.notes.trim()].filter(Boolean).join('\n'), notes: '' })}
                >
                  {m.fieldHint.moveToComments}
                </button>
              </div>
            )}
            {p.candidate !== 'excluded' && (p.exclusionReason || p.exclusionCategory) && <ExclusionFields product={p} />}
          </div>
        </div>

        <div className="section">
          <h3>{m.product.purchase}</h3>
          <div className="stack">
            <div className="seg" role="group" aria-label={m.field.purchaseStatus}>
              {(['none', 'ordered', 'purchased'] as PurchaseStatus[]).map((s) => (
                <button
                  key={s}
                  aria-pressed={p.purchase.status === s}
                  onClick={async () => {
                    await set({
                      purchase: {
                        ...p.purchase,
                        status: s,
                        price: p.purchase.price ?? (s !== 'none' ? p.price : null),
                        retailer: p.purchase.retailer || (s !== 'none' ? p.retailer : ''),
                      },
                    })
                    if (s === 'purchased') {
                      await updateProject(project.id, { status: 'purchased', decisionProductId: project.decisionProductId ?? p.id })
                    }
                  }}
                >
                  {m.purchase[s]}
                </button>
              ))}
            </div>
            {p.purchase.status !== 'none' && (
              <div className="grid-2">
                <Field label={m.field.purchaseDate}>
                  <CommitInput className="input" type="date" value={p.purchase.date} onCommit={(v) => set({ purchase: withPurchaseDate(p.purchase, v) })} />
                </Field>
                <Field label={m.field.purchasePrice}>
                  <CommitInput
                    className="input"
                    inputMode="decimal"
                    value={p.purchase.price !== null ? String(p.purchase.price) : ''}
                    onCommit={(v) => set({ purchase: { ...p.purchase, price: parseNumber(v) } })}
                  />
                </Field>
                <Field label={m.field.purchaseRetailer}>
                  <CommitInput className="input" value={p.purchase.retailer} onCommit={(v) => set({ purchase: { ...p.purchase, retailer: v } })} />
                </Field>
                <Field label={m.field.purchaseNote} hint={m.fieldHint.purchaseNote}>
                  <CommitInput className="input" value={p.purchase.note} onCommit={(v) => set({ purchase: { ...p.purchase, note: v } })} />
                </Field>
                <Field label={m.field.returnUntil}>
                  <CommitInput
                    className="input"
                    type="date"
                    value={p.purchase.returnUntil ?? ''}
                    aria-describedby="purchase-dates"
                    onCommit={(v) => set({ purchase: { ...p.purchase, returnUntil: v } })}
                  />
                </Field>
                <Field label={m.field.warrantyUntil}>
                  <CommitInput
                    className="input"
                    type="date"
                    value={p.purchase.warrantyUntil ?? ''}
                    aria-describedby="purchase-dates"
                    onCommit={(v) => set({ purchase: { ...p.purchase, warrantyUntil: v } })}
                  />
                </Field>
              </div>
            )}
            {p.purchase.status !== 'none' && (
              <p id="purchase-dates" className="muted small">
                {m.product.purchaseDatesHint}
              </p>
            )}
            {p.purchase.status === 'purchased' && p.purchase.price !== null && p.price !== null && p.purchase.price !== p.price && (
              <p className="muted small">
                {m.field.price}: {fmt.money(p.price)} → {fmt.money(p.purchase.price)}
              </p>
            )}
          </div>
        </div>

        {(p.links.length > 0 || Object.keys(p.extra).length > 0) && (
          <div className="section">
            <h3>{m.product.imported}</h3>
            <dl className="kv">
              {p.links.map((l, i) => {
                const h = safeHref(l)
                return (
                  <div key={l + i} style={{ display: 'contents' }}>
                    <dt>{i === 0 ? m.field.links : ''}</dt>
                    <dd>
                      {h ? (
                        <a className="link-out" href={h} target="_blank" rel="noopener noreferrer">
                          {hostOf(l)} <Glyph name="out" />
                        </a>
                      ) : (
                        l
                      )}
                    </dd>
                  </div>
                )
              })}
              {Object.entries(p.extra).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}

/** Why a product is out: a kind of reason to filter by, and optional details in own words. */
function ExclusionFields({ product: p, autoFocus }: { product: Product; autoFocus?: boolean }) {
  const { m } = useI18n()
  return (
    <div className="grid-2">
      <Field label={m.exclusion.category}>
        <select
          className="select"
          value={p.exclusionCategory ?? ''}
          autoFocus={autoFocus}
          onChange={(e) => updateProduct(p, { exclusionCategory: e.target.value as ExclusionCategory | '' })}
        >
          <option value="">{m.exclusion.none}</option>
          {EXCLUSION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {m.exclusion.categories[c]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={m.exclusion.details}>
        <CommitInput className="input" value={p.exclusionReason} onCommit={(v) => updateProduct(p, { exclusionReason: v })} />
      </Field>
    </div>
  )
}
