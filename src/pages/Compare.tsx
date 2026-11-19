import { isFavorite, statusOf } from '../domain/verdict'
import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Product, PropertyDef } from '../db/types'
import { avgStars, displayName, exclusionText, formatValue } from '../domain/display'
import { evaluate, WEIGHT } from '../domain/requirements'
import { reviewSummary } from '../domain/reviews'
import { directionOf, rank, type Better } from '../domain/ranking'
import { hostOf, safeHref } from '../domain/values'
import { useI18n } from '../i18n'
import { productImage } from '../images'
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
  const [onlyDiff, setOnlyDiff] = useState(false)

  if (data === undefined) return <main aria-busy="true" />
  if (data === null)
    return (
      <main>
        <div className="empty">{m.common.notFound}</div>
      </main>
    )

  const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
  const products = ids.map((x) => data.products.find((p) => p.id === x)).filter((p): p is Product => !!p)
  const back = `/p/${data.project.id}`
  /** Products of the comparison not yet side by side, the ones still in the running first. */
  const others = data.products.filter((p) => !ids.includes(p.id)).sort((a, b) => Number(a.candidate === 'excluded') - Number(b.candidate === 'excluded'))

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
        simple('candidate', m.field.candidate, (p) => `${m.candidate[statusOf(p)]}${isFavorite(p) ? ` ★` : ''}`),
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
   * A row of numbers placed side by side: with a direction the best value is green, the worst red
   * and the others show their distance to the best; without one a small bar shows where each
   * value lies between the smallest and the largest – no judgement.
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
    return {
      key,
      label,
      values: products.map((p, i) => (nums[i] === null || nums[i] === undefined ? String(fallback(p) ?? '') : String(nums[i]))),
      cells: products.map((p, i) => {
        const n = nums[i]
        if (n === null || n === undefined) return fallback(p)
        const mark = r.best.has(i) ? 'best' : r.worst.has(i) ? 'worst' : ''
        const d = r.delta[i]
        const s = r.scale[i]
        return (
          <span className={`num-cell ${mark}`}>
            <span className="num-value">{render ? render(p) : show(n)}</span>
            {mark && <span className="sr-only"> ({m.compare[mark]})</span>}
            {d !== null && d !== 0 && <span className="num-delta">{m.compare.toBest(signed(d))}</span>}
            {!better && s !== null && (
              <span className="num-scale" aria-hidden="true">
                <i style={{ left: `${s * 100}%` }} />
              </span>
            )}
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
    <main className="wide">
      <Link to={back} className="crumb">
        <Glyph name="chevronLeft" /> {data.project.name}
      </Link>
      <div className="page-head">
        <h1>{m.compare.title}</h1>
        <span className="count">{products.length}</span>
        <span className="spacer" />
        {others.length > 0 && (
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
      <div className="compare-wrap">
        <table className="compare">
          <colgroup>
            <col style={{ width: 200 }} />
            {products.map((p) => (
              <col key={p.id} style={{ width: 260 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="rowhead" />
              {products.map((p) => {
                const href = safeHref(p.url)
                const img = productImage(p)
                return (
                  <th key={p.id} scope="col" className={p.candidate === 'excluded' ? 'is-excluded' : undefined}>
                    {img && <img className="head-img" src={img} alt="" referrerPolicy="no-referrer" />}
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
                      <button
                        className="icon-btn sm"
                        aria-label={m.compare.remove}
                        title={m.compare.remove}
                        onClick={() => setParams({ ids: ids.filter((x) => x !== p.id).join(',') })}
                      >
                        <Glyph name="close" />
                      </button>
                    </div>
                    {href && <div className="muted small">{hostOf(p.url)}</div>}
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
    </main>
  )
}
