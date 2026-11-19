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
import { Menu } from '../../ui/Menu'
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

/**
 * The table's verdict cell: only one's own verdict as a symbol – neutral, paler, while none is
 * given. A tap opens the three choices with how many gave each (names on hover); choosing the
 * marked one again takes it back.
 */
export function VerdictCell({ product: p }: { product: Product }) {
  const { m } = useI18n()
  const me = useMe()
  const users = useUsers()
  const t = tally(p)
  const mine = p.votes?.[me.id] ?? null
  const shown = mine ?? 'neutral'
  const names = (v: Vote) =>
    Object.entries(p.votes ?? {})
      .filter(([, x]) => x === v)
      .map(([id]) => users.get(id) ?? '?')
      .join(', ')
  return (
    <Menu
      floating
      label={`${m.verdict.yours}: ${mine ? m.verdict[mine] : m.verdict.none}`}
      className={`cell verdict-trigger ${shown}${mine ? '' : ' unset'}`}
      listClassName="candidate-menu verdict-menu"
      trigger={<Glyph name={VOTE_GLYPH[shown]} />}
    >
      {(close) =>
        VOTES.map((v) => (
          <button
            key={v}
            type="button"
            className={`verdict-${v}`}
            aria-pressed={mine === v}
            title={t[v] ? m.verdict.named(m.verdict[v], names(v)) : undefined}
            onClick={() => {
              close()
              void setVote(p, me.id, mine === v ? null : v)
            }}
          >
            <Glyph name={VOTE_GLYPH[v]} /> {m.verdict[v]}
            {t[v] > 0 && <span className="muted"> · {t[v]}</span>}
          </button>
        ))
      }
    </Menu>
  )
}
