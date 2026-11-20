/**
 * How a product stands, as one set of controls (src/domain/verdict.ts): the favourite star for
 * everyone, and each person's verdict – thumbs up, neutral, thumbs down. The table and the details
 * use the same pieces, so they look and behave alike.
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

/** The favourite star; in the details it sits on a button like the verdict beside it. */
export function FavoriteToggle({ product: p, inDetails = false }: { product: Product; inDetails?: boolean }) {
  const { m } = useI18n()
  const on = isFavorite(p)
  return (
    <button
      type="button"
      className={inDetails ? 'btn sm square fav-toggle' : 'icon-btn sm fav-toggle'}
      aria-pressed={on}
      aria-label={m.verdict.favorite}
      title={on ? m.verdict.unmakeFavorite : m.verdict.makeFavorite}
      onClick={() => updateProduct(p, favoritePatch(p, !on))}
    >
      <Glyph name="star" />
    </button>
  )
}

/**
 * One's own verdict as a symbol – neutral, paler, while none is given – in the table and the
 * details alike. A tap opens the three choices with how many gave each (names on hover); choosing
 * the marked one again takes it back.
 */
export function VerdictCell({ product: p, inDetails = false }: { product: Product; inDetails?: boolean }) {
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
      className={`${inDetails ? 'btn sm square' : 'cell'} verdict-trigger ${shown}${mine ? '' : ' unset'}`}
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
