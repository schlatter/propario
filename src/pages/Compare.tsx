import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { Product } from '../db/types'
import { avgStars, displayName, exclusionText, formatValue } from '../domain/display'
import { evaluate, WEIGHT } from '../domain/requirements'
import { reviewSummary } from '../domain/reviews'
import { hostOf, safeHref } from '../domain/values'
import { useI18n } from '../i18n'
import { productImage } from '../images'
import { Glyph } from '../ui/Glyph'
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

  const prices = products.map((p) => p.price)
  const minPrice = Math.min(...prices.filter((x): x is number => x !== null))
  const rows: { group: string; rows: Row[] }[] = [
    {
      group: m.product.basics,
      rows: [
        {
          key: 'price',
          label: m.field.price,
          values: products.map((p) => (p.price ?? p.priceNote ?? '').toString()),
          cells: products.map((p) => (p.price !== null ? <span className={p.price === minPrice ? 'best' : ''}>{fmt.money(p.price)}</span> : p.priceNote)),
        },
        simple('retailer', m.field.retailer, (p) => p.retailer),
        simple('reviews', m.review.column, (p) =>
          (['product', 'shop'] as const)
            .map((about) => ({ about, s: reviewSummary(p.reviews, about) }))
            .filter(({ s }) => s.sources > 0)
            .map(({ about, s }) => m.review.summary(m.review.about[about], s.score!, s.sources))
            .join(' · '),
        ),
        simple('candidate', m.field.candidate, (p) => m.candidate[p.candidate]),
        {
          key: 'rating',
          label: m.field.rating,
          values: products.map((p) => String(avgStars(p) ?? '')),
          cells: products.map((p) => {
            const a = avgStars(p)
            return a !== null ? <Stars value={Math.round(a)} label={m.field.rating} /> : null
          }),
        },
        simple('productType', m.field.productType, (p) => p.productType),
        simple('variant', m.field.variant, (p) => p.variant),
      ],
    },
    {
      group: m.product.properties,
      rows: data.properties.map((prop) => ({
        key: prop.id,
        label: (
          <>
            {prop.name}
            {prop.unit && <span className="muted"> ({prop.unit})</span>}
          </>
        ),
        values: products.map((p) => formatValue(prop, p.values[prop.id], m, fmt)),
        cells: products.map((p) => formatValue(prop, p.values[prop.id], m, fmt)),
      })),
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
              {
                key: 'fit',
                label: m.check.fit,
                values: products.map((p) => String(data.summaries.get(p.id)!.fit)),
                cells: products.map((p) => {
                  const s = data.summaries.get(p.id)!
                  return m.check.fitSummary(s.fit, s.fitOpen)
                }),
              },
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
                  <th key={p.id} scope="col">
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
                        <td key={products[i].id}>{c}</td>
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
