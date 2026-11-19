/**
 * How a product stands, as one set of controls (src/domain/verdict.ts): the favourite star for
 * everyone, and each person's verdict – thumbs up, neutral, thumbs down. The table, the details
 * and swipe mode use the same pieces, so they look and behave alike.
 */
import { setVote, updateProduct } from '../../db/repo'
import { VOTES, type Product, type Vote } from '../../db/types'
import { favoritePatch, isFavorite, tally } from '../../domain/verdict'
import { useI18n } from '../../i18n'
import { useMe } from '../../session'
import { Glyph, type GlyphName } from '../../ui/Glyph'
import { useUsers } from '../../users'

export const VOTE_GLYPH: Record<Vote, GlyphName> = { like: 'thumbUp', neutral: 'neutral', dislike: 'thumbDown' }

export function FavoriteToggle({ product: p, withLabel = false }: { product: Product; withLabel?: boolean }) {
  const { m } = useI18n()
  const on = isFavorite(p)
  const label = on ? m.verdict.unmakeFavorite : m.verdict.makeFavorite
  return (
    <button
      type="button"
      className={withLabel ? 'btn sm fav-toggle' : 'icon-btn sm fav-toggle'}
      aria-pressed={on}
      aria-label={withLabel ? undefined : m.verdict.favorite}
      title={label}
      onClick={() => updateProduct(p, favoritePatch(p, !on))}
    >
      <Glyph name="star" />
      {withLabel && ` ${m.verdict.favorite}`}
    </button>
  )
}

/** The signed-in person's verdict; pressing the chosen one again takes it back. */
export function VerdictControl({ product: p }: { product: Product }) {
  const { m } = useI18n()
  const me = useMe()
  const mine = p.votes?.[me.id] ?? null
  return (
    <div className="seg verdict-control" role="group" aria-label={m.verdict.yours}>
      {VOTES.map((v) => (
        <button
          key={v}
          type="button"
          className={`verdict-${v}`}
          aria-pressed={mine === v}
          title={m.verdict[v]}
          onClick={() => void setVote(p, me.id, mine === v ? null : v)}
        >
          <Glyph name={VOTE_GLYPH[v]} />
          <span className="verdict-label">{m.verdict.short[v]}</span>
        </button>
      ))}
    </div>
  )
}

/** Everyone's verdicts as counts, with the names for screen readers and on hover. */
export function VerdictSummary({ product: p }: { product: Product }) {
  const { m } = useI18n()
  const users = useUsers()
  const t = tally(p)
  const names = (v: Vote) =>
    Object.entries(p.votes ?? {})
      .filter(([, x]) => x === v)
      .map(([id]) => users.get(id) ?? '?')
      .join(', ')
  const said = VOTES.filter((v) => t[v] > 0)
  if (!said.length) return null
  const text = m.verdict.others(said.map((v) => m.verdict.named(m.verdict[v], names(v))))
  return (
    <span className="votes" title={text}>
      {said.map((v) => (
        <span key={v} className={`vote ${v}`} aria-hidden="true">
          <Glyph name={VOTE_GLYPH[v]} /> {t[v]}
        </span>
      ))}
      <span className="sr-only">{text}</span>
    </span>
  )
}
