import { isFavorite, statusOf } from '../domain/verdict'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Product, PropertyDef, Ranking } from '../db/types'
import { setDecision, updateProject } from '../db/repo'
import { current, decide, everyone, finished, joint, normalize, progress, remaining, skip, startOrder, type Side } from '../domain/duel'
import { useUsers } from '../users'
import { Gallery } from './project/Gallery'
import { SizeCompare } from './project/SizeCompare'
import { FavoriteToggle, VerdictCell } from './project/Verdict'
import { avgStars, displayName, exclusionText, formatValue } from '../domain/display'
import { evaluate, WEIGHT } from '../domain/requirements'
import { reviewSummary } from '../domain/reviews'
import { directionOf, rank, type Better } from '../domain/ranking'
import { hostOf, safeHref } from '../domain/values'
import { useI18n } from '../i18n'
import { useMe } from '../session'
import { isPicture, productImage } from '../images'
import { Glyph } from '../ui/Glyph'
import { Menu } from '../ui/Menu'
import { CheckMark, PriorityTag, Stars, Verdict } from '../ui/Marks'
import { useProjectData } from './project/useProjectData'

interface Row {
  key: string
  label: ReactNode
  /** Comparable text per product; rows with more than one distinct value are highlighted. */
  values: string[]
  cells: ReactNode[]
  /** Index of the best numeric value, if the row has a clear "better" direction. */
  best?: number
}

export function ComparePage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const data = useProjectData(id)
  const { m, fmt } = useI18n()
  const me = useMe()
  const users = useUsers()
  const [onlyDiff, setOnlyDiff] = useState(false)
  /** Rankings before each duel of this visit, for taking one back. */
  const [history, setHistory] = useState<Ranking[]>([])
  const [gallery, setGallery] = useState<{ product: Product; at: number } | null>(null)
  const duelMode = params.get('mode') === 'duel'

  // Duels: the products that take part, in the person's order so far (src/domain/duel.ts).
  // Only the narrow choice takes part: what someone starred and what everyone likes.
  const eligible = data ? startOrder(data.products, me.id) : []
  const mine = data ? normalize(data.project.rankings?.[me.id], eligible) : null
  const pair = duelMode && mine ? current(mine) : null
  const choose = (side: Side) => {
    if (!data || !mine || !pair) return
    setHistory((h) => [...h, mine])
    void updateProject(data.project.id, { rankings: { [me.id]: decide(mine, side) } })
  }
  /** Puts the current duel off: its challenger comes back at the end of this place. */
  const later = mine && pair ? skip(mine) : null
  const putOff = () => {
    if (!data || !mine || !later) return
    setHistory((h) => [...h, mine])
    void updateProject(data.project.id, { rankings: { [me.id]: later } })
  }
  const undo = () => {
    const last = history[history.length - 1]
    if (!data || !last) return
    setHistory((h) => h.slice(0, -1))
    void updateProject(data.project.id, { rankings: { [me.id]: last } })
  }
  // ← → choose in a duel, Backspace takes the last choice back.
  useEffect(() => {
    if (!duelMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || (e.target instanceof Element && e.target.closest('input, textarea, select, dialog'))) return
      if (e.key === 'ArrowLeft') choose('left')
      else if (e.key === 'ArrowRight') choose('right')
      else if (e.key === 'ArrowDown' && later) putOff()
      else if (e.key === 'Backspace') undo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (data === undefined) return <main aria-busy="true" />
  if (data === null)
    return (
      <main>
        <div className="empty">{m.common.notFound}</div>
      </main>
    )

  const ids = duelMode ? (pair ? [pair.left, pair.right] : []) : (params.get('ids') ?? '').split(',').filter(Boolean)
  const products = ids.map((x) => data.products.find((p) => p.id === x)).filter((p): p is Product => !!p)
  const back = `/p/${data.project.id}`
  /** Products of the comparison not yet side by side, the ones still in the running first. */
  const others = data.products.filter((p) => !ids.includes(p.id)).sort((a, b) => Number(a.candidate === 'excluded') - Number(b.candidate === 'excluded'))

  if (duelMode && products.length < 2) {
    return (
      <main className="wide">
        <Link to={back} className="crumb">
          <Glyph name="chevronLeft" /> {data.project.name}
        </Link>
        <div className="page-head">
          <h1>{m.duel.open}</h1>
        </div>
        <p className="muted">{eligible.length < 2 ? m.duel.tooFew : m.duel.done}</p>
        {history.length > 0 && (
          <button type="button" className="btn sm" onClick={undo}>
            {m.duel.undo}
          </button>
        )}
        {mine && eligible.length > 1 && <RankingList data={data} mine={mine} meId={me.id} users={users} />}
      </main>
    )
  }

  if (products.length < 2) {
    return (
      <main>
        <div className="empty">
          <p>{m.compare.tooFew}</p>
          <Link className="btn" to={back} style={{ marginTop: 12 }}>
            {m.compare.backToTable}
          </Link>
        </div>
      </main>
    )
  }

  const rows: { group: string; rows: Row[] }[] = [
    {
      group: m.product.basics,
      rows: [
        numeric(
          'price',
          m.field.price,
          (p) => p.price,
          'lower',
          (n) => fmt.money(n),
          (p) => p.priceNote,
        ),
        simple('retailer', m.field.retailer, (p) => p.retailer),
        numeric(
          'reviews',
          m.review.column,
          (p) => reviewSummary(p.reviews, 'product').score,
          'higher',
          (n) => `${fmt.number(n)}/100`,
          (p) =>
            (['product', 'shop'] as const)
              .map((about) => ({ about, s: reviewSummary(p.reviews, about) }))
              .filter(({ s }) => s.sources > 0)
              .map(({ about, s }) => m.review.summary(m.review.about[about], s.score!, s.sources))
              .join(' · '),
        ),
        simple('candidate', m.field.candidate, (p) => `${m.candidate[statusOf(p)]}${isFavorite(p, me.id) ? ` ★` : ''}`),
        numeric(
          'rating',
          m.field.rating,
          (p) => avgStars(p),
          'higher',
          (n) => fmt.number(Math.round(n * 10) / 10),
          () => '',
          (p) => {
            const a = avgStars(p)
            return a !== null ? <Stars value={Math.round(a)} label={m.field.rating} /> : null
          },
        ),
        simple('productType', m.field.productType, (p) => p.productType),
        simple('variant', m.field.variant, (p) => p.variant),
      ],
    },
    {
      group: m.product.properties,
      rows: data.properties.map((prop) => propertyRow(prop)),
    },
    {
      group: m.product.requirements,
      rows: [
        {
          key: 'verdict',
          label: m.field.checks,
          values: products.map((p) => JSON.stringify(data.summaries.get(p.id))),
          cells: products.map((p) => <Verdict summary={data.summaries.get(p.id)!} />),
        },
        ...(data.checkable.some((r) => WEIGHT[r.priority])
          ? [
              numeric(
                'fit',
                m.check.fit,
                (p) => data.summaries.get(p.id)!.fit,
                'higher',
                (n) => `${fmt.number(n)} %`,
                (p) => {
                  const s = data.summaries.get(p.id)!
                  return m.check.fitSummary(s.fit, s.fitOpen)
                },
              ),
            ]
          : []),
        ...data.checkable.map((r) => ({
          key: r.id,
          label: (
            <span className="row" style={{ gap: 6 }}>
              <PriorityTag p={r.priority} /> {r.label}
            </span>
          ),
          values: products.map((p) => evaluate(r, p, data.propMap)),
          cells: products.map((p) => <CheckMark result={evaluate(r, p, data.propMap)} manual={!!p.checks[r.id]} />),
        })),
      ],
    },
    {
      group: m.product.assessment,
      rows: [
        simple('overall', m.field.overall, (p) => p.overall),
        simple('pros', m.field.pros, (p) => p.pros),
        simple('cons', m.field.cons, (p) => p.cons),
        simple('comments', m.field.comments, (p) => p.comments),
        simple('exclusionReason', m.field.exclusionReason, (p) => exclusionText(p, m)),
      ],
    },
  ]

  function simple(key: string, label: string, get: (p: Product) => string): Row {
    const values = products.map(get)
    return { key, label, values, cells: values.map((v) => <span style={{ whiteSpace: 'pre-wrap' }}>{v}</span>) }
  }

  /**
   * A row of numbers placed side by side, each with a bar as long as its value (so 160 next to 180
   * looks like it) and its difference: with a direction the best value is green, the worst red and
   * the others show their distance to the best; without one the distance to the first product –
   * in a duel the one holding the place.
   */
  function numeric(
    key: string,
    label: ReactNode,
    get: (p: Product) => number | null | undefined,
    better: Better | undefined,
    show: (n: number) => string,
    fallback: (p: Product) => ReactNode = () => '',
    render?: (p: Product) => ReactNode,
  ): Row {
    const nums = products.map(get)
    const r = rank(nums, better)
    const signed = (d: number) => (d > 0 ? `+${show(d)}` : `−${show(-d)}`)
    const known = nums.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    const top = Math.max(...known.map(Math.abs))
    // From zero when all values are positive (lengths, prices); otherwise between smallest and largest.
    const share = (n: number, i: number) => (Math.min(...known) >= 0 ? (top > 0 ? n / top : 0) : r.scale[i])
    const first = nums[0]
    const firstName = products[0].model || displayName(products[0], m)
    return {
      key,
      label,
      values: products.map((p, i) => (nums[i] === null || nums[i] === undefined ? String(fallback(p) ?? '') : String(nums[i]))),
      cells: products.map((p, i) => {
        const n = nums[i]
        if (n === null || n === undefined) return fallback(p)
        const mark = r.best.has(i) ? 'best' : r.worst.has(i) ? 'worst' : ''
        const d = better ? r.delta[i] : i > 0 && typeof first === 'number' ? Math.round((n - first) * 1000) / 1000 : null
        const s = known.length > 1 ? share(n, i) : null
        return (
          <span className={`num-cell ${mark}`}>
            <span className="num-value">{render ? render(p) : show(n)}</span>
            {mark && <span className="sr-only"> ({m.compare[mark]})</span>}
            {s !== null && (
              <span className="num-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, s * 100)}%` }} />
              </span>
            )}
            {d !== null && d !== 0 && <span className="num-delta">{better ? m.compare.toBest(signed(d)) : m.compare.toFirst(signed(d), firstName)}</span>}
            {d === 0 && !better && i > 0 && <span className="num-delta">{m.compare.sameAsFirst(firstName)}</span>}
          </span>
        )
      }),
    }
  }

  function propertyRow(prop: PropertyDef): Row {
    const label = (
      <>
        {prop.name}
        {prop.unit && <span className="muted"> ({prop.unit})</span>}
      </>
    )
    if (prop.type === 'number' || prop.type === 'rating') {
      const unit = prop.unit ? ` ${prop.unit}` : ''
      return numeric(
        prop.id,
        label,
        (p) => (typeof p.values[prop.id] === 'number' ? (p.values[prop.id] as number) : null),
        prop.type === 'rating' ? 'higher' : directionOf(prop, data!.rules),
        (n) => `${fmt.number(n)}${unit}`,
        (p) => formatValue(prop, p.values[prop.id], m, fmt),
      )
    }
    const values = products.map((p) => formatValue(prop, p.values[prop.id], m, fmt))
    if (prop.type === 'boolean')
      return {
        key: prop.id,
        label,
        values,
        cells: products.map((p) => {
          const v = p.values[prop.id]
          return v === true ? (
            <CheckMark result="pass" label={m.common.yes} />
          ) : v === false ? (
            <CheckMark result="fail" label={m.common.no} />
          ) : (
            values[products.indexOf(p)]
          )
        }),
      }
    return { key: prop.id, label, values, cells: values }
  }

  const differs = (r: Row) => new Set(r.values.map((v) => v.trim().toLowerCase())).size > 1
  const isEmpty = (r: Row) => r.values.every((v) => !v.trim())

  return (
    <main className="wide compare-page">
      <Link to={back} className="crumb">
        <Glyph name="chevronLeft" /> {data.project.name}
      </Link>
      <div className="page-head">
        <h1>{duelMode ? m.duel.open : m.compare.title}</h1>
        {!duelMode && <span className="count">{products.length}</span>}
        <span className="spacer" />
        {!duelMode && others.length > 0 && (
          <Menu
            label={m.compare.add}
            className="btn sm"
            scroll
            trigger={
              <>
                <Glyph name="plus" /> {m.compare.add}
              </>
            }
          >
            {(close) =>
              others.map((p) => (
                <button
                  key={p.id}
                  className={p.candidate === 'excluded' ? 'is-excluded' : ''}
                  onClick={() => {
                    close()
                    setParams({ ids: [...ids, p.id].join(',') })
                  }}
                >
                  {displayName(p, m)}
                </button>
              ))
            }
          </Menu>
        )}
        <label className="check">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          {m.compare.onlyDifferences}
        </label>
      </div>
      {duelMode && mine && pair && (
        // Which of the two is better: the answer moves the winner up (src/domain/duel.ts).
        // The question in one line with what is left, and the same progress bar as when swiping.
        <div className="duel-bar">
          <p className="duel-question">
            <b>{m.duel.question}</b>
            <span className="muted small">{remaining(mine).toFirst > 0 ? m.duel.toFirst(remaining(mine).toFirst) : m.duel.toAll(remaining(mine).toAll)}</span>
          </p>
          <div className="swipe-progress" aria-hidden="true">
            <i style={{ width: `${progress(mine).total ? (progress(mine).done / progress(mine).total) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      <SizeCompare products={products} data={data} />
      <div className={`compare-wrap${duelMode ? ' duel' : ''}`}>
        <table className={`compare${duelMode ? ' duel' : ''}`}>
          {!duelMode && (
            <colgroup>
              <col style={{ width: 200 }} />
              {products.map((p) => (
                <col key={p.id} style={{ width: 260 }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              <th className="rowhead" />
              {products.map((p) => {
                const href = safeHref(p.url)
                const img = productImage(p)
                return (
                  <th key={p.id} scope="col" className={p.candidate === 'excluded' ? 'is-excluded' : undefined}>
                    {img && (
                      // The pictures decide a lot: a tap shows them large, all of them.
                      <button
                        type="button"
                        className="head-pic"
                        onClick={() => setGallery({ product: p, at: 0 })}
                        aria-label={m.image.openGallery(picturesOf(p).length)}
                      >
                        <img className="head-img" src={img} alt="" referrerPolicy="no-referrer" />
                        {picturesOf(p).length > 1 && <span className="head-count">{picturesOf(p).length}</span>}
                      </button>
                    )}
                    {p.brand && <div className="muted small">{p.brand}</div>}
                    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                      <span className="head-name" style={{ flex: 1 }}>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {p.model || displayName(p, m)}
                          </a>
                        ) : (
                          p.model || displayName(p, m)
                        )}
                      </span>
                      {!duelMode && (
                        <button
                          className="icon-btn sm"
                          aria-label={m.compare.remove}
                          title={m.compare.remove}
                          onClick={() => setParams({ ids: ids.filter((x) => x !== p.id).join(',') })}
                        >
                          <Glyph name="close" />
                        </button>
                      )}
                    </div>
                    {href && <div className="muted small">{hostOf(p.url)}</div>}
                    {/* Star and verdict as in the product table: seen and set right here. */}
                    <div className="head-verdict">
                      <FavoriteToggle product={p} inDetails />
                      <VerdictCell product={p} inDetails />
                    </div>
                    {data.project.decisionProductId === p.id && (
                      <span className="pill fav" style={{ marginTop: 6 }}>
                        {m.project.decision}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const visible = g.rows.filter((r) => !isEmpty(r) && (!onlyDiff || differs(r)))
              if (!visible.length) return null
              return [
                <tr className="group" key={`g-${g.group}`}>
                  <th className="rowhead" colSpan={products.length + 1} scope="colgroup">
                    {g.group}
                  </th>
                </tr>,
                ...visible.map((r) => {
                  const d = differs(r)
                  return (
                    <tr key={r.key} className={d ? 'differs' : ''}>
                      <th className="rowhead" scope="row">
                        {r.label}
                        {d && <span className="sr-only"> ({m.compare.differs})</span>}
                      </th>
                      {r.cells.map((c, i) => (
                        <td key={products[i].id} className={products[i].candidate === 'excluded' ? 'is-excluded' : undefined}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </div>
      {duelMode && mine && pair && (
        // The choice sits at the bottom of the screen, where the thumb is – like when swiping.
        <div className="duel-actions" role="group" aria-label={m.duel.question}>
          {/* ✓ = take this one: a choice, not a swipe. "Later" sits quietly between the two. */}
          <div className="duel-choices">
            <button type="button" className="btn primary" onClick={() => choose('left')} aria-keyshortcuts="ArrowLeft">
              <Glyph name="check" />
              <span className="duel-name">{products[0].model || displayName(products[0], m)}</span>
            </button>
            {later ? (
              <button type="button" className="btn sm duel-later" onClick={putOff} aria-keyshortcuts="ArrowDown">
                {m.duel.skip}
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn primary" onClick={() => choose('right')} aria-keyshortcuts="ArrowRight">
              <Glyph name="check" />
              <span className="duel-name">{products[1].model || displayName(products[1], m)}</span>
            </button>
          </div>
          {history.length > 0 && (
            <div className="duel-more">
              <button type="button" className="link-btn small" onClick={undo}>
                {m.duel.undo}
              </button>
            </div>
          )}
        </div>
      )}
      {duelMode && mine && <RankingList data={data} mine={mine} meId={me.id} users={users} />}
      {gallery && (
        <Gallery pictures={picturesOf(gallery.product)} name={displayName(gallery.product, m)} start={gallery.at} open onClose={() => setGallery(null)} />
      )}
    </main>
  )
}

const picturesOf = (p: Product) => [productImage(p), ...(p.images ?? []).filter(isPicture)].filter((x): x is string => !!x)

/**
 * The rankings so far: one's own (decided places marked) and everyone else's who has duelled,
 * joined into one by the average place. The joint first place can become the decision.
 */
function RankingList({
  data,
  mine,
  meId,
  users,
}: {
  data: NonNullable<ReturnType<typeof useProjectData>>
  mine: Ranking
  meId: string
  users: Map<string, string>
}) {
  const { m } = useI18n()
  // Each person ranks their own preselection; the joint ranking covers what is in anyone's.
  const { states, all } = everyone({ ...data.project.rankings, [meId]: mine }, data.products)
  const others = states
    .filter(([id]) => id !== meId)
    .map(([id, r]) => ({ id, name: users.get(id) ?? '?', r }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const together = others.length > 0
  const order = together ? joint([mine, ...others.map((o) => o.r)], all).map((x) => x.id) : mine.order
  const byId = new Map(data.products.map((p) => [p.id, p]))
  const place = (r: Ranking, id: string) => {
    const at = r.order.indexOf(id)
    return at < 0 ? '–' : `${at + 1}${at < r.settled || finished(r) ? ' ✓' : ''}`
  }
  const top = byId.get(order[0])
  const decided = data.project.decisionProductId
  return (
    <section className="ranking" aria-labelledby="ranking-title">
      <div className="row">
        <h2 id="ranking-title">{together ? m.duel.jointTitle : m.duel.yourTitle}</h2>
        <span className="spacer" />
        {top && decided !== top.id && (mine.settled > 0 || finished(mine)) && (
          <button type="button" className="btn sm" onClick={() => void setDecision(data.project, top.id)}>
            <Glyph name="flag" /> {m.duel.makeDecision(top.model || displayName(top, m))}
          </button>
        )}
      </div>
      <p className="muted small">{together ? m.duel.jointHint : m.duel.yourHint}</p>
      <table className="ranking-table">
        <thead>
          <tr>
            <th scope="col">{m.duel.place}</th>
            <th scope="col">{m.field.product}</th>
            {together && <th scope="col">{m.duel.you}</th>}
            {together &&
              others.map((o) => (
                <th key={o.id} scope="col">
                  {o.name}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {order.map((id, i) => {
            const p = byId.get(id)
            if (!p) return null
            return (
              <tr key={id} className={decided === id ? 'is-decision' : undefined}>
                <td className="place">{together ? i + 1 : place(mine, id)}</td>
                <td>
                  <Link to={`/p/${data.project.id}?product=${id}`}>{displayName(p, m)}</Link>
                </td>
                {together && <td>{place(mine, id)}</td>}
                {together && others.map((o) => <td key={o.id}>{place(o.r, id)}</td>)}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
