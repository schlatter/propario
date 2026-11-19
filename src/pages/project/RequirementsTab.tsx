import { useState } from 'react'
import { addProperty, addRequirement, deleteRequirement, reorder, updateProduct, updateProject, updateRequirement } from '../../db/repo'
import { PRIORITIES, type Condition, type ConditionOp, type Priority, type Requirement } from '../../db/types'
import { productName } from '../../domain/display'
import { BLOCKING, evaluate, WEIGHT } from '../../domain/requirements'
import { fieldFromRequirement } from '../../import/normalize'
import { parseNumber } from '../../domain/values'
import { useI18n } from '../../i18n'
import { useConfirm } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { CommitInput, CommitTextarea } from '../../ui/inputs'
import { CheckMark } from '../../ui/Marks'
import type { ProjectData } from './useProjectData'
import { useRowDrag, type RowDrag } from '../../ui/useRowDrag'

/** Target option that creates the field a requirement asks about. */
const NEW_FIELD = '__new-field'

const NUMERIC_OPS: ConditionOp[] = ['lte', 'lt', 'gte', 'gt', 'eq', 'neq']
const TEXT_OPS: ConditionOp[] = ['contains', 'eq', 'neq']
const BOOL_OPS: ConditionOp[] = ['isTrue', 'isFalse']

export function RequirementsTab({ data, onOpen }: { data: ProjectData; onOpen: (id: string) => void }) {
  const { m } = useI18n()
  const { project, requirements } = data
  const [label, setLabel] = useState('')
  const [priority, setPriority] = useState<Priority>('must')
  const [category, setCategory] = useState('')

  const groups = new Map<string, Requirement[]>()
  for (const r of requirements) {
    const list = groups.get(r.category) ?? []
    list.push(r)
    groups.set(r.category, list)
  }
  const categories = [...new Set(requirements.map((r) => r.category).filter(Boolean))]
  const confirm = useConfirm()
  const { fmt } = useI18n()

  // ---- moving rows: drag the handle (or arrow keys on it), also into another group ----
  /** The rows as shown: grouped by category, in their stored order within each group. */
  const ordered = [...groups.values()].flat()
  const moveTo = async (id: string, targetId: string, after: boolean) => {
    const moving = ordered.find((r) => r.id === id)
    const target = ordered.find((r) => r.id === targetId)
    if (!moving || !target || id === targetId) return
    const list = ordered.filter((r) => r.id !== id)
    list.splice(list.findIndex((r) => r.id === targetId) + (after ? 1 : 0), 0, moving)
    // Dropped among another group's rows, it joins that group.
    if (moving.category !== target.category) await updateRequirement(moving, { category: target.category })
    await reorder('requirements', list)
  }
  const drag = useRowDrag(
    ordered.map((r) => r.id),
    (id, target, after) => void moveTo(id, target, after),
  )

  /** Sum of the soft weights, to show each requirement's share of the fit. */
  const totalWeight = data.rules.reduce((n, r) => n + (WEIGHT[r.priority] ?? 0), 0)

  /** An own price rule becomes the budget's maximum (≤) or minimum (≥), with its priority. */
  const takeIntoBudget = async (r: Requirement) => {
    const c = r.condition!
    const value = typeof c.value === 'number' ? c.value : parseNumber(String(c.value ?? ''))
    if (value === null) return
    const max = c.op === 'lte' || c.op === 'lt'
    const ok = await confirm({
      title: m.budget.takeTitle(r.label),
      text: m.budget.takeText(max ? m.budget.max : m.budget.min, fmt.money(value), m.priority[r.priority]),
      confirmLabel: m.budget.take,
    })
    if (!ok) return
    await updateProject(project.id, max ? { budget: value, budgetPriority: r.priority } : { budgetMin: value, budgetMinPriority: r.priority })
    await deleteRequirement(r)
  }

  /** The comparison's own rules on the price (e.g. a "Budget" imported from Excel). */
  const priceRules = requirements.filter(
    (r) => r.condition?.target.kind === 'price' && (r.condition.op === 'lte' || r.condition.op === 'lt' || r.condition.op === 'gte' || r.condition.op === 'gt'),
  )

  return (
    <div className="stack" style={{ gap: 16 }}>
      <form
        className="quick-add"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!label.trim()) return
          await addRequirement(project.id, { label: label.trim(), priority, category: category.trim() })
          setLabel('')
        }}
      >
        <Glyph name="plus" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={m.requirements.labelPlaceholder} aria-label={m.field.requirement} />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={m.requirements.categoryPlaceholder}
          aria-label={m.field.category}
          list="req-categories"
          style={{ maxWidth: 160, borderLeft: '1px solid var(--line)', paddingLeft: 10 }}
        />
        <datalist id="req-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <select
          className="select"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          aria-label={m.field.priority}
          style={{ width: 'auto', minHeight: 32 }}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {m.priority[p]}
            </option>
          ))}
        </select>
        <button className="btn primary sm" type="submit" disabled={!label.trim()}>
          {m.requirements.add}
        </button>
      </form>

      <div className="table-wrap">
        <table className="grid req-table">
          <colgroup>
            <col style={{ width: 112 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 84 }} />
            <col style={{ width: 330 }} />
            <col style={{ width: 130 }} />
            {/* Details take the rest of the width. */}
            <col />
            <col style={{ width: 84 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{m.field.priority}</th>
              <th scope="col">{m.field.requirement}</th>
              <th scope="col" title={m.check.fitHint}>
                {m.requirements.weight}
              </th>
              <th scope="col">{m.requirements.ruleColumn}</th>
              <th scope="col">{m.field.category}</th>
              <th scope="col">{m.field.description}</th>
              <th scope="col">
                <span className="sr-only">{m.common.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody ref={drag.body}>
            <tr className="group">
              <th colSpan={7} scope="colgroup">
                {m.budget.title}
              </th>
            </tr>
            <BudgetRow
              label={m.budget.max}
              sign="≤"
              hint={m.budget.maxHint}
              value={project.budget ?? null}
              priority={project.budgetPriority ?? 'must'}
              totalWeight={totalWeight}
              onValue={(n) => updateProject(project.id, { budget: n })}
              onPriority={(p) => updateProject(project.id, { budgetPriority: p })}
            />
            <BudgetRow
              label={m.budget.min}
              sign="≥"
              hint={m.budget.minHint}
              value={project.budgetMin ?? null}
              priority={project.budgetMinPriority ?? 'important'}
              totalWeight={totalWeight}
              onValue={(n) => updateProject(project.id, { budgetMin: n })}
              onPriority={(p) => updateProject(project.id, { budgetMinPriority: p })}
            />
            {[...groups.entries()].map(([cat, list]) => [
              <tr className="group" key={`g-${cat}`}>
                <th colSpan={7} scope="colgroup">
                  {cat || m.requirements.general}
                </th>
              </tr>,
              ...list.map((r) => <RequirementRow key={r.id} req={r} data={data} totalWeight={totalWeight} drag={drag} />),
            ])}
          </tbody>
        </table>
      </div>
      {priceRules.length > 0 && (
        <div className="price-rules">
          <p className="small muted">
            {project.budget != null || project.budgetMin != null ? m.budget.ownPriceRule(priceRules.map((r) => r.label)) : m.budget.ownPriceRuleNoBudget}
          </p>
          {priceRules.map((r) => (
            <button key={r.id} type="button" className="btn sm" onClick={() => takeIntoBudget(r)}>
              {m.budget.takeButton(r.label)}
            </button>
          ))}
        </div>
      )}
      {project.budget != null && project.budgetMin != null && project.budgetMin > project.budget && (
        <p className="small filter-error" role="alert">
          {m.budget.minAboveMax}
        </p>
      )}
      {requirements.length === 0 && <p className="muted">{m.requirements.empty}</p>}
      {data.products.length > 0 && data.checkable.length > 0 && <Matrix data={data} onOpen={onOpen} />}
    </div>
  )
}

/** One budget line, as a row of the requirements: its priority, an amount and what it means. */
function BudgetRow({
  label,
  sign,
  hint,
  value,
  priority,
  totalWeight,
  onValue,
  onPriority,
}: {
  label: string
  sign: '≤' | '≥'
  hint: string
  value: number | null
  priority: Priority
  totalWeight: number
  onValue: (n: number | null) => void
  onPriority: (p: Priority) => void
}) {
  const { m } = useI18n()
  return (
    <tr className="budget">
      <td>
        <PrioritySelect value={priority} onChange={onPriority} label={`${m.field.priority}: ${label}`} />
      </td>
      <th scope="row" className="req-static">
        {label}
      </th>
      <WeightCell priority={priority} total={totalWeight} />
      <td>
        <span className="rule-cell">
          <span className="muted">
            {m.field.price} {sign}
          </span>
          <CommitInput
            className="cell-input num"
            inputMode="decimal"
            value={value !== null ? String(value) : ''}
            aria-label={label}
            onCommit={(v) => {
              const n = parseNumber(v)
              onValue(n !== null && n >= 0 ? n : null)
            }}
          />
          <span className="muted">€</span>
        </span>
      </td>
      <td />
      <td className="muted small req-static">{hint}</td>
      <td />
    </tr>
  )
}

/** The priority as a compact select whose colour says how much it counts. */
function PrioritySelect({ value, onChange, label }: { value: Priority; onChange: (p: Priority) => void; label: string }) {
  const { m } = useI18n()
  return (
    <select
      className={`cell-select prio-${value}`}
      value={value}
      onChange={(e) => onChange(e.target.value as Priority)}
      aria-label={label}
      title={m.priorityHint[value]}
    >
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {m.priority[p]}
        </option>
      ))}
    </select>
  )
}

/** How much a requirement counts: must and exclusion filter; the others carry a share of the fit. */
function WeightCell({ priority, total }: { priority: Priority; total: number }) {
  const { m } = useI18n()
  const w = WEIGHT[priority]
  const text = BLOCKING.includes(priority) ? m.requirements.weightFilter : !w ? '–' : total ? `${w} · ${Math.round((100 * w) / total)} %` : String(w)
  return (
    <td className="weight-cell" title={m.check.fitHint}>
      {text}
    </td>
  )
}

function RequirementRow({ req, data, totalWeight, drag }: { req: Requirement; data: ProjectData; totalWeight: number; drag: RowDrag }) {
  const { m } = useI18n()
  const confirm = useConfirm()
  const set = (patch: Partial<Requirement>) => updateRequirement(req, patch)
  const c = req.condition
  const ruleProps = data.properties.filter((p) => p.type !== 'url')
  const targetKey = c ? (c.target.kind === 'price' ? 'price' : c.target.propertyId) : ''
  const prop = c?.target.kind === 'property' ? data.propMap.get(c.target.propertyId) : undefined
  const ops = !c
    ? []
    : c.target.kind === 'price' || prop?.type === 'number' || prop?.type === 'rating' || prop?.type === 'date'
      ? NUMERIC_OPS
      : prop?.type === 'boolean'
        ? BOOL_OPS
        : TEXT_OPS
  const named = (what: string) => `${what}: ${req.label}`

  const setTarget = (key: string) => {
    if (!key) return set({ condition: null })
    const target: Condition['target'] = key === 'price' ? { kind: 'price' } : { kind: 'property', propertyId: key }
    const p = key === 'price' ? null : data.propMap.get(key)
    const op: ConditionOp = p?.type === 'boolean' ? 'isTrue' : p && (p.type === 'text' || p.type === 'select') ? 'contains' : 'lte'
    return set({ condition: { target, op, value: c?.value ?? '' } })
  }

  // A field this requirement asks about but the comparison lacks ("Maximale Tiefe 40 cm" → Tiefe, cm).
  const wanted = fieldFromRequirement(req.label, req.description)
  const hasWanted = data.properties.some((p) => p.name.toLowerCase() === wanted.name.toLowerCase())
  const createField = async () => {
    const field = await addProperty(req.projectId, { name: wanted.name, type: 'number', unit: wanted.unit })
    await set({ condition: { target: { kind: 'property', propertyId: field.id }, op: wanted.op ?? 'lte', value: wanted.value ?? '' } })
  }

  return (
    <tr {...drag.row(req.id)}>
      <td>
        <PrioritySelect value={req.priority} onChange={(p) => set({ priority: p })} label={named(m.field.priority)} />
      </td>
      <td>
        <CommitInput className="cell-input strong" value={req.label} onCommit={(v) => v.trim() && set({ label: v.trim() })} aria-label={m.field.requirement} />
      </td>
      <WeightCell priority={req.priority} total={totalWeight} />
      <td>
        {req.priority === 'info' ? null : c ? (
          <span className="rule-cell">
            <select
              className="cell-select"
              value={targetKey}
              onChange={(e) => (e.target.value === NEW_FIELD ? void createField() : setTarget(e.target.value))}
              aria-label={named(m.requirements.ruleTarget)}
            >
              <option value="price">{m.field.price}</option>
              {ruleProps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.unit ? ` (${p.unit})` : ''}
                </option>
              ))}
              {!hasWanted && <option value={NEW_FIELD}>{m.requirements.newField(wanted.name, wanted.unit)}</option>}
            </select>
            <select
              className="cell-select"
              value={c.op}
              onChange={(e) => set({ condition: { ...c, op: e.target.value as ConditionOp } })}
              aria-label={named(m.field.rule)}
            >
              {ops.map((o) => (
                <option key={o} value={o}>
                  {m.op[o]}
                </option>
              ))}
            </select>
            {c.op !== 'isTrue' && c.op !== 'isFalse' && (
              <CommitInput
                className="cell-input num"
                value={c.value === undefined ? '' : String(c.value)}
                aria-label={named(m.requirements.ruleValue)}
                type={prop?.type === 'date' ? 'date' : 'text'}
                onCommit={(v) => {
                  const n = parseNumber(v)
                  void set({ condition: { ...c, value: ops === NUMERIC_OPS && n !== null ? n : v } })
                }}
              />
            )}
            {(c.target.kind === 'price' ? '€' : prop?.unit) && <span className="muted">{c.target.kind === 'price' ? '€' : prop?.unit}</span>}
            <button
              className="icon-btn sm"
              onClick={() => set({ condition: null })}
              aria-label={named(m.requirements.removeRule)}
              title={m.requirements.removeRule}
            >
              <Glyph name="close" />
            </button>
          </span>
        ) : (
          <span className="rule-cell">
            <span className="muted small">{m.requirements.noRule}</span>
            <button className="link-btn small" onClick={() => setTarget(ruleProps.find((p) => p.type === 'number')?.id ?? 'price')}>
              + {m.requirements.addRule}
            </button>
            {!hasWanted && wanted.value !== undefined && (
              <button className="link-btn small" onClick={() => createField()}>
                + {m.requirements.newField(wanted.name, wanted.unit)}
              </button>
            )}
          </span>
        )}
      </td>
      <td>
        <CommitInput
          className="cell-input"
          list="req-categories"
          value={req.category}
          placeholder={m.requirements.general}
          onCommit={(v) => set({ category: v.trim() })}
          aria-label={named(m.field.category)}
        />
      </td>
      <td>
        <CommitTextarea
          className="cell-input"
          rows={1}
          value={req.description}
          placeholder={m.requirements.descriptionPlaceholder}
          onCommit={(v) => set({ description: v })}
          aria-label={named(m.field.description)}
        />
      </td>
      <td>
        <span className="row-actions">
          <button type="button" className="grip" aria-label={m.reorder.handle(req.label)} title={m.reorder.requirementHint} {...drag.handle(req.id)}>
            <Glyph name="grip" />
          </button>
          <button
            className="icon-btn sm"
            aria-label={named(m.common.delete)}
            title={m.common.delete}
            onClick={async () => {
              if (await confirm({ title: m.requirements.deleteTitle(req.label), confirmLabel: m.common.delete, danger: true })) await deleteRequirement(req)
            }}
          >
            <Glyph name="trash" />
          </button>
        </span>
      </td>
    </tr>
  )
}

function Matrix({ data, onOpen }: { data: ProjectData; onOpen: (id: string) => void }) {
  const { m } = useI18n()
  const products = data.products.filter((p) => p.candidate !== 'excluded')
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2>{m.requirements.matrix}</h2>
      <p className="muted small">{m.requirements.matrixHint}</p>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th className="rowhead" />
              {products.map((p) => (
                <th key={p.id} scope="col">
                  <button
                    className="btn ghost sm"
                    style={{ whiteSpace: 'normal', fontSize: 12, padding: '2px 4px', minHeight: 0 }}
                    onClick={() => onOpen(p.id)}
                  >
                    {productName(p, m.product.unnamed)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.checkable.map((r) => (
              <tr key={r.id}>
                <th className="rowhead" scope="row">
                  <span className="prio" data-p={r.priority} style={{ minWidth: 0, marginRight: 8 }}>
                    {m.priority[r.priority]}
                  </span>
                  {r.label}
                </th>
                {products.map((p) => {
                  const res = evaluate(r, p, data.propMap)
                  const manual = p.checks[r.id]
                  return (
                    <td key={p.id}>
                      <button
                        title={m.check.manualHint}
                        aria-label={`${r.label} / ${productName(p, '')}: ${m.check[res]}`}
                        onClick={() => {
                          const checks = { ...p.checks }
                          if (!manual) checks[r.id] = 'pass'
                          else if (manual === 'pass') checks[r.id] = 'fail'
                          else delete checks[r.id]
                          void updateProduct(p, { checks })
                        }}
                      >
                        <CheckMark result={res} manual={!!manual} />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
