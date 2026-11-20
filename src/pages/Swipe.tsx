import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { setVote } from '../db/repo'
import type { Product, Vote } from '../db/types'
import { displayName, formatValue } from '../domain/display'
import { safeHref, hostOf } from '../domain/values'
import { useI18n } from '../i18n'
import { isPicture, productImage } from '../images'
import { meaning } from '../domain/page-import'
import { Gallery } from './project/Gallery'
import { FavoriteToggle } from './project/Verdict'
import { useMe } from '../session'
import { Glyph } from '../ui/Glyph'
import { CheckStrip, Verdict } from '../ui/Marks'
import { useProjectData, type ProjectData } from './project/useProjectData'

/** Distance in px after which letting go counts as a vote. */
const THRESHOLD = 110

/**
 * Swipe mode: one product at a time, a quick "like" or "not for us". Each person votes for
 * themselves; votes show up in the table. Swiping is a shortcut, never the only way: the
 * buttons and the arrow keys do the same.
 */
export function SwipePage() {
  const { id } = useParams()
  const data = useProjectData(id)
  const { m } = useI18n()
  if (data === undefined) return <main aria-busy="true" />
  if (data === null)
    return (
      <main>
        <div className="empty">
          <p>{m.common.notFound}</p>
        </div>
      </main>
    )
  return <Deck data={data} />
}

function Deck({ data }: { data: ProjectData }) {
  const { m } = useI18n()
  const me = useMe()
  const { project, products } = data
  const [skipped, setSkipped] = useState<string[]>([])
  // Products voted in this visit, in order (for undo, and so a card never reappears while saving).
  const [done, setDone] = useState<string[]>([])
  const [leaving, setLeaving] = useState<Vote | null>(null)

  // Excluded products are already decided; the rest in table order, skipped ones last.
  const open = products.filter((p) => p.candidate !== 'excluded')
  const pending = useMemo(() => {
    const todo = open.filter((p) => !p.votes?.[me.id] && !done.includes(p.id))
    return [...todo.filter((p) => !skipped.includes(p.id)), ...todo.filter((p) => skipped.includes(p.id))]
  }, [open, me.id, skipped, done])
  const current = pending[0]
  const voted = open.length - pending.length

  const decide = async (vote: Vote) => {
    if (!current || leaving) return
    setLeaving(vote)
    await new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180))
    // The next card comes at once; the vote is saved meanwhile. If it cannot be saved, the card
    // comes back and the app says why (src/App.tsx, SaveErrors).
    const id = current.id
    setDone((d) => [...d, id])
    setSkipped((s) => s.filter((x) => x !== id))
    setLeaving(null)
    setVote(current, me.id, vote).catch((e: unknown) => {
      setDone((d) => d.filter((x) => x !== id))
      throw e
    })
  }
  const skip = () => current && setSkipped((s) => [...s.filter((x) => x !== current.id), current.id])
  const undo = async () => {
    const last = products.find((p) => p.id === done[done.length - 1])
    if (!last) return
    setDone((d) => d.slice(0, -1))
    await setVote(last, me.id, null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      // The gallery has its own keys; a vote must not slip through behind it.
      if (document.querySelector('dialog[open]')) return
      if (e.key === 'ArrowRight') void decide('like')
      else if (e.key === 'ArrowLeft') void decide('dislike')
      else if (e.key === 'ArrowDown') void decide('neutral')
      else if (e.key === 'Backspace') void undo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <main className="swipe-page">
      <Link to={`/p/${project.id}`} className="crumb">
        <Glyph name="chevronLeft" /> {project.name}
      </Link>
      {/* One line: the question and how far along – the card gets the screen. Others' verdicts stay
          out of sight here, so each judges for themselves. */}
      <div className="swipe-head">
        <h1>{m.swipe.title}</h1>
        <span className="swipe-count" role="status" aria-label={m.swipe.progress(voted, open.length)}>
          {voted}/{open.length}
        </span>
      </div>
      <div className="swipe-progress" aria-hidden="true">
        <i style={{ width: `${open.length ? (voted / open.length) * 100 : 0}%` }} />
      </div>

      {current ? (
        <>
          <Card key={current.id} product={current} data={data} leaving={leaving} onVote={decide} />
          <div className="swipe-actions">
            <button type="button" className="swipe-btn no" title={m.swipe.dislike} onClick={() => void decide('dislike')} aria-keyshortcuts="ArrowLeft">
              <Glyph name="thumbDown" />
              <span>{m.verdict.short.dislike}</span>
            </button>
            <button type="button" className="swipe-btn neutral" title={m.swipe.neutral} onClick={() => void decide('neutral')} aria-keyshortcuts="ArrowDown">
              <Glyph name="neutral" />
              <span>{m.verdict.short.neutral}</span>
            </button>
            <button type="button" className="swipe-btn yes" title={m.swipe.like} onClick={() => void decide('like')} aria-keyshortcuts="ArrowRight">
              <Glyph name="thumbUp" />
              <span>{m.verdict.short.like}</span>
            </button>
          </div>
          <p className="muted small swipe-hint">
            {m.swipe.hint}{' '}
            <button type="button" className="link-btn inline" onClick={skip}>
              {m.swipe.skip}
            </button>
            {done.length > 0 && (
              <>
                {' '}
                <button type="button" className="link-btn inline" onClick={() => void undo()}>
                  {m.swipe.undo}
                </button>
              </>
            )}
          </p>
        </>
      ) : (
        <Done data={data} />
      )}
    </main>
  )
}

function Card({ product: p, data, leaving, onVote }: { product: Product; data: ProjectData; leaving: Vote | null; onVote: (v: Vote) => void }) {
  const { m, fmt } = useI18n()
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; id: number; onPicture: boolean } | null>(null)
  const [gallery, setGallery] = useState(false)
  const pictures = [productImage(p), ...(p.images ?? []).filter(isPicture)].filter((x): x is string => !!x)
  const href = safeHref(p.url)
  // Width × height × depth on one line, like in the details; then a few other fields.
  const dims = DIMS.map((d) => ({ d, prop: data.properties.find((prop) => meaning(prop.name) === d) }))
    .map(({ d, prop }) => ({ d, text: prop ? formatValue(prop, p.values?.[prop.id], m, fmt) : '', id: prop?.id }))
    .filter((x) => x.text)
  const facts = data.properties
    .filter((prop) => !dims.some((x) => x.id === prop.id))
    .map((prop) => ({ prop, text: formatValue(prop, p.values?.[prop.id], m, fmt) }))
    .filter((f) => f.text)
    .slice(0, 4)

  const offset = leaving === 'like' ? 700 : leaving === 'dislike' ? -700 : dx
  const hint = offset > 40 ? 'like' : offset < -40 ? 'dislike' : null

  return (
    <article
      className={`swipe-card${dx !== 0 ? ' dragging' : ''}`}
      // Neutral leaves downwards, like and dislike to their side.
      style={{ transform: leaving === 'neutral' ? 'translateY(420px)' : `translateX(${offset}px) rotate(${offset / 18}deg)` }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('a, button')) return
        start.current = { x: e.clientX, id: e.pointerId, onPicture: !!(e.target as HTMLElement).closest('.swipe-media') }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => start.current?.id === e.pointerId && setDx(e.clientX - start.current.x)}
      onPointerUp={() => {
        const d = dx
        const s = start.current
        start.current = null
        setDx(0)
        if (d > THRESHOLD) onVote('like')
        else if (d < -THRESHOLD) onVote('dislike')
        // A tap on the picture – no swipe – shows it large.
        else if (s?.onPicture && Math.abs(d) < 8 && pictures.length) setGallery(true)
      }}
      onPointerCancel={() => {
        start.current = null
        setDx(0)
      }}
      aria-label={displayName(p, m)}
    >
      {hint && (
        <span className={`swipe-stamp ${hint}`} aria-hidden="true">
          {hint === 'like' ? m.swipe.like : m.swipe.dislike}
        </span>
      )}
      <div className="swipe-media">
        {pictures.length ? <img src={pictures[0]} alt="" draggable={false} /> : <span className="monogram">{(p.brand || p.model || '?').slice(0, 2)}</span>}
        <span className="swipe-media-tools">
          <FavoriteToggle product={p} inDetails />
          {pictures.length > 0 && (
            <button type="button" className="btn sm swipe-zoom" onClick={() => setGallery(true)} aria-label={m.image.openGallery(pictures.length)}>
              <Glyph name="image" /> {pictures.length > 1 ? pictures.length : ''}
            </button>
          )}
        </span>
      </div>
      <div className="swipe-body">
        <div className="swipe-title">
          <div style={{ minWidth: 0 }}>
            {p.brand && <div className="muted small">{p.brand}</div>}
            <h2>{p.model || displayName(p, m)}</h2>
          </div>
          {p.price !== null && <b className="swipe-price">{fmt.money(p.price)}</b>}
        </div>
        {dims.length > 0 && (
          <p className="swipe-dims">
            <span className="muted">{m.product.dimensions}</span>{' '}
            {dims.map((x, i) => (
              <span key={x.d}>
                {i > 0 && <span className="dim-x">×</span>}
                <span className="dim-letter">{m.product.dimLetter[x.d]}</span> {x.text}
              </span>
            ))}
          </p>
        )}
        {(data.checkable.length > 0 || href) && (
          <div className="row" style={{ gap: 10 }}>
            {data.checkable.length > 0 && (
              <>
                <Verdict summary={data.summaries.get(p.id)!} />
                <CheckStrip items={data.results(p)} />
              </>
            )}
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" className="small">
                {p.retailer || hostOf(p.url)} <Glyph name="out" />
              </a>
            )}
          </div>
        )}
        {facts.length > 0 && (
          <dl className="swipe-facts">
            {facts.map((f) => (
              <div key={f.prop.id}>
                <dt>{f.prop.name}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {pictures.length > 0 && <Gallery pictures={pictures} name={displayName(p, m)} start={0} open={gallery} onClose={() => setGallery(false)} />}
    </article>
  )
}

const DIMS = ['width', 'height', 'depth'] as const

/** All voted: what everyone liked, and the way back. */
function Done({ data }: { data: ProjectData }) {
  const { m } = useI18n()
  const voters = new Set(data.products.flatMap((p) => Object.keys(p.votes ?? {})))
  const shared = data.products.filter((p) => {
    const v = Object.values(p.votes ?? {})
    return v.length > 0 && v.length === voters.size && v.every((x) => x === 'like')
  })
  return (
    <div className="empty stack" style={{ alignItems: 'center' }}>
      <h2>{m.swipe.doneTitle}</h2>
      {shared.length > 0 ? (
        <>
          <p>{voters.size > 1 ? m.swipe.likedByAll(shared.length) : m.swipe.likedByYou(shared.length)}</p>
          <ul className="plain-list" style={{ minWidth: 260 }}>
            {shared.map((p) => (
              <li key={p.id}>
                <Link to={`/p/${data.project.id}?product=${p.id}`}>{displayName(p, m)}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">{m.swipe.noneShared}</p>
      )}
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link to={`/p/${data.project.id}/compare?mode=duel`} className="btn primary">
          <Glyph name="duel" /> {m.swipe.toDuel}
        </Link>
        <Link to={`/p/${data.project.id}`} className="btn">
          {m.swipe.toTable}
        </Link>
      </div>
    </div>
  )
}
