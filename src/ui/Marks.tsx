import type { Priority, ProjectStatus } from '../db/types'
import type { CheckResult, Summary } from '../domain/requirements'
import { useI18n } from '../i18n'
import { Glyph } from './Glyph'

export function CheckMark({ result, manual }: { result: CheckResult; manual?: boolean }) {
  const { m } = useI18n()
  const label = m.check[result] + (manual ? ` (${m.check.manual})` : '')
  return (
    <span className={`mark ${result}${manual ? ' manual' : ''}`} role="img" aria-label={label} title={label}>
      {result === 'pass' ? '✓' : result === 'fail' ? '✕' : '?'}
    </span>
  )
}

/** One cell per checkable requirement; must/exclusion cells are taller. */
export function CheckStrip({ items }: { items: { id: string; result: CheckResult; blocking: boolean; label: string }[] }) {
  const { m } = useI18n()
  if (!items.length) return null
  if (items.length > 16) {
    // Too many cells to read; show the share of met / not met / unknown instead.
    const count = (r: CheckResult) => items.filter((i) => i.result === r).length
    return (
      <span className="share" aria-hidden="true" title={m.check.summary(count('pass'), count('fail'), count('unknown'))}>
        {(['pass', 'fail', 'unknown'] as CheckResult[]).map((r) => (count(r) ? <i key={r} className={r} style={{ flexGrow: count(r) }} /> : null))}
      </span>
    )
  }
  return (
    <span className="strip" aria-hidden="true">
      {items.map((i) => (
        <i key={i.id} className={`${i.result}${i.blocking ? ' blocking' : ''}`} title={`${i.label}: ${m.check[i.result]}`} />
      ))}
    </span>
  )
}

export function Verdict({ summary }: { summary: Summary }) {
  const { m } = useI18n()
  const kind = summary.blocked ? 'fail' : summary.qualified ? 'pass' : 'unknown'
  const text = summary.blocked ? m.check.blocked : summary.qualified ? m.check.eligible : m.check.open
  return (
    <span className={`verdict ${kind}`} title={m.check.summary(summary.pass, summary.fail, summary.unknown)}>
      <CheckMark result={kind} />
      <span className="sr-only">
        {text}. {m.check.summary(summary.pass, summary.fail, summary.unknown)}
      </span>
      <span aria-hidden="true">
        {summary.pass}/{summary.pass + summary.fail + summary.unknown}
      </span>
    </span>
  )
}

const RAIL: ProjectStatus[] = ['research', 'comparing', 'decided', 'purchased']

export function Stage({ status }: { status: ProjectStatus }) {
  const { m } = useI18n()
  const idx = RAIL.indexOf(status)
  return (
    <span className="stage" data-status={status}>
      <span className="stage-rail" aria-hidden="true">
        {RAIL.map((s, i) => (
          <i key={s} className={i <= idx ? 'on' : ''} />
        ))}
      </span>
      {m.status[status]}
    </span>
  )
}

export function PriorityTag({ p }: { p: Priority }) {
  const { m } = useI18n()
  return (
    <span className="prio" data-p={p} title={m.priorityHint[p]}>
      {m.priority[p]}
    </span>
  )
}

export function Stars({ value, onChange, label }: { value: number | null; onChange?: (v: number | null) => void; label: string }) {
  const { m } = useI18n()
  const v = value ?? 0
  if (!onChange) {
    return (
      <span className="stars readonly" role="img" aria-label={`${label}: ${m.product.stars(v)}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= v ? 'on' : ''}>
            <Glyph name="star" />
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className="stars" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= v ? 'on' : ''}
          aria-pressed={n <= v}
          aria-label={m.product.stars(n)}
          title={m.product.stars(n)}
          onClick={() => onChange(n === v ? null : n)}
        >
          <Glyph name="star" />
        </button>
      ))}
    </span>
  )
}
