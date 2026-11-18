/**
 * Product details: offers from several shops and ratings from outside sources. Both are entered
 * by hand (or taken from the product's own data) – Propario does not fetch them, see
 * src/domain/lookup.ts for the links that help find them.
 */
import { changeOffers, changeReviews } from '../../db/repo'
import { REVIEW_SCALES, type Offer, type Product, type Review, type ReviewScale } from '../../db/types'
import { bestOffer, offerTotal } from '../../domain/offers'
import { KNOWN_SOURCES, reviewSummary, score } from '../../domain/reviews'
import { hostOf, normalizeUrl, parseNumber, safeHref, todayIso } from '../../domain/values'
import { useI18n } from '../../i18n'
import { newId } from '../../shared/ids.ts'
import { Glyph } from '../../ui/Glyph'
import { CommitInput } from '../../ui/inputs'

/**
 * One field of an entry with a short visible label. The visible label is the start of the
 * field's full name ("Price" of "Price, offer 2"), so what people see is what screen readers say.
 */
function Mini({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`mini${wide ? ' wide' : ''}`}>
      <span>{label.split(',')[0]}</span>
      {children}
    </label>
  )
}

/** Opens a stored link in a new tab; nothing when the link is not http(s). */
function OutLink({ url, label }: { url: string; label: string }) {
  const href = safeHref(url)
  if (!href) return <span />
  return (
    <a className="icon-btn" href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
      <Glyph name="out" />
    </a>
  )
}

export function OffersSection({ product: p }: { product: Product }) {
  const { m, fmt } = useI18n()
  const offers = p.offers ?? []
  const best = bestOffer(offers)

  // Entries are addressed by id: the list may have changed since this render.
  const change = (id: string, patch: Partial<Offer>) => {
    // A price someone enters is a price seen today, as for the product's own price.
    const dated = ('price' in patch || 'shipping' in patch) && !('date' in patch) ? { ...patch, date: todayIso() } : patch
    void changeOffers(p, (list) => list.map((o) => (o.id === id ? { ...o, ...dated } : o)))
  }
  const add = () => {
    // The first offer starts from what the product already knows.
    const first = offers.length === 0 && (p.price !== null || p.retailer)
    const o: Offer = first
      ? { id: newId(), shop: p.retailer, price: p.price, shipping: null, date: p.priceDate || todayIso(), url: p.url }
      : { id: newId(), shop: '', price: null, shipping: null, date: todayIso(), url: '' }
    void changeOffers(p, (list) => [...list, o])
  }

  return (
    <div className="section">
      <h3>{m.offer.title}</h3>
      {offers.length === 0 && <p className="muted small">{m.offer.empty}</p>}
      {offers.map((o, i) => {
        const n = i + 1
        const total = offerTotal(o)
        return (
          <div className="entry" key={o.id}>
            <Mini label={m.offer.shop(n)}>
              <CommitInput className="input" aria-label={m.offer.shop(n)} value={o.shop} onCommit={(v) => change(o.id, { shop: v.trim() })} />
            </Mini>
            <Mini label={m.offer.price(n)}>
              <CommitInput
                className="input num"
                inputMode="decimal"
                aria-label={m.offer.price(n)}
                value={o.price !== null ? String(o.price) : ''}
                onCommit={(v) => change(o.id, { price: parseNumber(v) })}
              />
            </Mini>
            <Mini label={m.offer.shipping(n)}>
              <CommitInput
                className="input num"
                inputMode="decimal"
                aria-label={m.offer.shipping(n)}
                value={o.shipping !== null ? String(o.shipping) : ''}
                onCommit={(v) => change(o.id, { shipping: parseNumber(v) })}
              />
            </Mini>
            <Mini label={m.offer.date(n)}>
              <CommitInput className="input" type="date" aria-label={m.offer.date(n)} value={o.date} onCommit={(v) => change(o.id, { date: v })} />
            </Mini>
            <Mini wide label={m.offer.url(n)}>
              <CommitInput
                className="input"
                type="url"
                aria-label={m.offer.url(n)}
                value={o.url}
                onCommit={(v) => {
                  const url = normalizeUrl(v)
                  change(o.id, { url, shop: o.shop || hostOf(url) })
                }}
              />
            </Mini>
            <span className="entry-end">
              {total !== null && (
                <span className={`pill${best?.id === o.id ? ' pass' : ''}`}>{best?.id === o.id ? m.offer.best(fmt.money(total)) : fmt.money(total)}</span>
              )}
              <OutLink url={o.url} label={m.offer.open(o.shop || hostOf(o.url))} />
              <button
                type="button"
                className="icon-btn"
                aria-label={m.offer.remove(n)}
                title={m.common.delete}
                onClick={() => changeOffers(p, (list) => list.filter((x) => x.id !== o.id))}
              >
                <Glyph name="close" />
              </button>
            </span>
          </div>
        )
      })}
      <button type="button" className="chip" onClick={add}>
        + {m.offer.add}
      </button>
      {offers.length > 0 && <p className="muted small">{m.offer.hint}</p>}
    </div>
  )
}

export function ReviewsSection({ product: p }: { product: Product }) {
  const { m } = useI18n()
  const reviews = p.reviews ?? []
  const change = (id: string, patch: Partial<Review>) => changeReviews(p, (list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const product = reviewSummary(reviews, 'product')
  const shop = reviewSummary(reviews, 'shop')

  return (
    <div className="section">
      <h3>{m.review.title}</h3>
      {(product.sources > 0 || shop.sources > 0) && (
        <p className="review-summary">
          {product.sources > 0 && <span>{m.review.summary(m.review.about.product, product.score!, product.sources)}</span>}
          {shop.sources > 0 && <span>{m.review.summary(m.review.about.shop, shop.score!, shop.sources)}</span>}
        </p>
      )}
      {reviews.length === 0 && <p className="muted small">{m.review.empty}</p>}
      <datalist id="review-sources">
        {KNOWN_SOURCES.map((s) => (
          <option key={s.name} value={s.name} />
        ))}
      </datalist>
      {reviews.map((r, i) => {
        const n = i + 1
        const s = score(r)
        return (
          <div className="entry" key={r.id}>
            <Mini label={m.review.source(n)}>
              <CommitInput
                className="input"
                list="review-sources"
                aria-label={m.review.source(n)}
                placeholder={m.review.sourcePlaceholder}
                value={r.source}
                onCommit={(v) => {
                  const source = v.trim()
                  // A known source brings its usual scale and subject, as long as no value is set yet.
                  const known = r.value === null ? KNOWN_SOURCES.find((k) => k.name.toLowerCase() === source.toLowerCase()) : undefined
                  void change(r.id, known ? { source: known.name, scale: known.scale, about: known.about } : { source })
                }}
              />
            </Mini>
            <Mini label={m.review.aboutLabel(n)}>
              <select
                className="select"
                aria-label={m.review.aboutLabel(n)}
                value={r.about}
                onChange={(e) => change(r.id, { about: e.target.value as Review['about'] })}
              >
                <option value="product">{m.review.about.product}</option>
                <option value="shop">{m.review.about.shop}</option>
              </select>
            </Mini>
            <Mini label={m.review.value(n)}>
              <CommitInput
                className="input num"
                inputMode="decimal"
                aria-label={m.review.value(n)}
                placeholder={m.review.valuePlaceholder[r.scale]}
                value={r.value !== null ? String(r.value) : ''}
                onCommit={(v) => change(r.id, { value: parseNumber(v) })}
              />
            </Mini>
            <Mini label={m.review.scaleLabel(n)}>
              <select
                className="select"
                aria-label={m.review.scaleLabel(n)}
                value={r.scale}
                onChange={(e) => change(r.id, { scale: e.target.value as ReviewScale })}
              >
                {REVIEW_SCALES.map((sc) => (
                  <option key={sc} value={sc}>
                    {m.review.scale[sc]}
                  </option>
                ))}
              </select>
            </Mini>
            <Mini label={m.review.count(n)}>
              <CommitInput
                className="input num"
                inputMode="numeric"
                aria-label={m.review.count(n)}
                value={r.count !== null ? String(r.count) : ''}
                onCommit={(v) => {
                  const c = parseNumber(v)
                  void change(r.id, { count: c !== null && c >= 0 ? Math.round(c) : null })
                }}
              />
            </Mini>
            <Mini label={m.review.date(n)}>
              <CommitInput className="input" type="date" aria-label={m.review.date(n)} value={r.date} onCommit={(v) => change(r.id, { date: v })} />
            </Mini>
            <Mini wide label={m.review.url(n)}>
              <CommitInput className="input" type="url" aria-label={m.review.url(n)} value={r.url} onCommit={(v) => change(r.id, { url: normalizeUrl(v) })} />
            </Mini>
            <span className="entry-end">
              {r.value !== null && <span className="pill">{s !== null ? m.review.converted(s) : m.review.outOfScale}</span>}
              <OutLink url={r.url} label={m.review.open(r.source || hostOf(r.url))} />
              <button
                type="button"
                className="icon-btn"
                aria-label={m.review.remove(n)}
                title={m.common.delete}
                onClick={() => changeReviews(p, (list) => list.filter((x) => x.id !== r.id))}
              >
                <Glyph name="close" />
              </button>
            </span>
          </div>
        )
      })}
      <button
        type="button"
        className="chip"
        onClick={() =>
          changeReviews(p, (list) => [
            ...list,
            { id: newId(), source: '', about: 'product', value: null, scale: 'stars5', count: null, date: todayIso(), url: '' },
          ])
        }
      >
        + {m.review.add}
      </button>
      <p className="muted small">{m.review.hint}</p>
    </div>
  )
}
