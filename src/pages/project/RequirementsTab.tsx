import { useState } from 'react'
import { addRequirement, deleteRequirement, reorder, updateProduct, updateProject, updateRequirement } from '../../db/repo'
import { PRIORITIES, type Condition, type ConditionOp, type Priority, type Requirement } from '../../db/types'
import { productName } from '../../domain/display'
import { evaluate } from '../../domain/requirements'
import { parseNumber } from '../../domain/values'
import { useI18n } from '../../i18n'
import { useConfirm } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { CommitInput, CommitTextarea, Field } from '../../ui/inputs'
import { CheckMark } from '../../ui/Marks'
import type { ProjectData } from './useProjectData'

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
  const move = (r: Requirement, delta: number) => {
    const list = [...requirements]
    const i = list.findIndex((x) => x.id === r.id)
    const j = i + delta
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    void reorder('requirements', list)
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="budget-row">
        <Field label={m.budget.input}>
          <CommitInput
            className="input"
            inputMode="decimal"
            value={project.budget !== null && project.budget !== undefined ? String(project.budget) : ''}
            aria-describedby="budget-hint"
            onCommit={(v) => {
              const n = parseNumber(v)
              void updateProject(project.id, { budget: n !== null && n >= 0 ? n : null })
            }}
          />
        </Field>
        <p id="budget-hint" className="muted small">
          {m.budget.hint}
        </p>
      </div>
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

      {requirements.length === 0 ? (
        <div className="empty">{m.requirements.empty}</div>
      ) : (
        <>
          <div>
            {[...groups.entries()].map(([cat, list]) => (
              <section className="req-group" key={cat || '_'}>
                <h3>{cat || m.requirements.general}</h3>
                {list.map((r) => (
                  <RequirementRow key={r.id} req={r} data={data} onMove={(d) => move(r, d)} />
                ))}
              </section>
            ))}
          </div>
          {data.products.length > 0 && data.checkable.length > 0 && <Matrix data={data} onOpen={onOpen} />}
        </>
      )}
    </div>
  )
}

function RequirementRow({ req, data, onMove }: { req: Requirement; data: ProjectData; onMove: (delta: number) => void }) {
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

  const setTarget = (key: string) => {
    if (!key) return set({ condition: null })
    const target: Condition['target'] = key === 'price' ? { kind: 'price' } : { kind: 'property', propertyId: key }
    const p = key === 'price' ? null : data.propMap.get(key)
    const op: ConditionOp = p?.type === 'boolean' ? 'isTrue' : p && (p.type === 'text' || p.type === 'select') ? 'contains' : 'lte'
    return set({ condition: { target, op, value: c?.value ?? '' } })
  }

  return (
    <div className="req">
      <div className="prio-col stack" style={{ gap: 6 }}>
        <select
          className="select"
          value={req.priority}
          onChange={(e) => set({ priority: e.target.value as Priority })}
          aria-label={m.field.priority}
          title={m.priorityHint[req.priority]}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {m.priority[p]}
            </option>
          ))}
        </select>
      </div>
      <div className="req-main">
        <CommitInput className="req-label" value={req.label} onCommit={(v) => v.trim() && set({ label: v.trim() })} aria-label={m.field.requirement} />
        <CommitTextarea
          className="req-desc"
          rows={1}
          value={req.description}
          placeholder={m.requirements.descriptionPlaceholder}
          onCommit={(v) => set({ description: v })}
          aria-label={m.field.description}
        />
        {req.priority !== 'info' && (
          <div className="rule">
            {c ? (
              <>
                <select className="select" value={targetKey} onChange={(e) => setTarget(e.target.value)} aria-label={m.requirements.ruleTarget}>
                  <option value="price">{m.field.price}</option>
                  {ruleProps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.unit ? ` (${p.unit})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  value={c.op}
                  onChange={(e) => set({ condition: { ...c, op: e.target.value as ConditionOp } })}
                  aria-label={m.field.rule}
                >
                  {ops.map((o) => (
                    <option key={o} value={o}>
                      {m.op[o]}
                    </option>
                  ))}
                </select>
                {c.op !== 'isTrue' && c.op !== 'isFalse' && (
                  <CommitInput
                    className="input"
                    value={c.value === undefined ? '' : String(c.value)}
                    aria-label={m.requirements.ruleValue}
                    type={prop?.type === 'date' ? 'date' : 'text'}
                    onCommit={(v) => {
                      const n = parseNumber(v)
                      void set({ condition: { ...c, value: ops === NUMERIC_OPS && n !== null ? n : v } })
                    }}
                  />
                )}
                {(c.target.kind === 'price' ? '€' : prop?.unit) && <span className="muted">{c.target.kind === 'price' ? '€' : prop?.unit}</span>}
                <button className="btn ghost sm" onClick={() => set({ condition: null })}>
                  {m.requirements.removeRule}
                </button>
              </>
            ) : (
              <>
                <span className="muted">{m.requirements.noRule}</span>
                <button className="btn ghost sm" onClick={() => setTarget(ruleProps.find((p) => p.type === 'number')?.id ?? 'price')}>
                  + {m.requirements.addRule}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
        <CommitInput
          className="req-cat"
          style={{ width: 110 }}
          value={req.category}
          placeholder={m.field.category}
          onCommit={(v) => set({ category: v.trim() })}
          aria-label={m.field.category}
        />
        <button className="icon-btn sm" onClick={() => onMove(-1)} aria-label={m.common.moveUp} title={m.common.moveUp}>
          <Glyph name="up" />
        </button>
        <button className="icon-btn sm" onClick={() => onMove(1)} aria-label={m.common.moveDown} title={m.common.moveDown}>
          <Glyph name="down" />
        </button>
        <button
          className="icon-btn sm"
          aria-label={m.common.delete}
          title={m.common.delete}
          onClick={async () => {
            if (await confirm({ title: m.requirements.deleteTitle(req.label), confirmLabel: m.common.delete, danger: true })) await deleteRequirement(req)
          }}
        >
          <Glyph name="trash" />
        </button>
      </div>
    </div>
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
