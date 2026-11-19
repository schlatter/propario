import { useState } from 'react'
import { addProperty, deleteProperty, reorder, updateProperty } from '../../db/repo'
import { PROPERTY_TYPES, type PropertyDef, type PropertyType } from '../../db/types'
import { useI18n } from '../../i18n'
import { useConfirm } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { CommitInput } from '../../ui/inputs'
import { useRowDrag, type RowDrag } from '../../ui/useRowDrag'
import type { ProjectData } from './useProjectData'

export function FieldsTab({ data }: { data: ProjectData }) {
  const { m } = useI18n()
  const { project, properties } = data
  const [name, setName] = useState('')
  const [type, setType] = useState<PropertyType>('text')
  const [unit, setUnit] = useState('')
  const existing = new Set(properties.map((p) => p.name.toLowerCase()))

  const add = (n: string, t: PropertyType, u: string) => addProperty(project.id, { name: n.trim(), type: t, unit: u.trim() })
  const drag = useRowDrag(
    properties.map((p) => p.id),
    (id, targetId, after) => {
      const moving = properties.find((p) => p.id === id)
      if (!moving) return
      const list = properties.filter((p) => p.id !== id)
      list.splice(list.findIndex((p) => p.id === targetId) + (after ? 1 : 0), 0, moving)
      void reorder('properties', list)
    },
  )

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 980 }}>
      <p className="muted">{m.fields.intro}</p>
      <form
        className="quick-add"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          // A unit belongs to numbers only (also when a previous number field's unit is still typed in).
          await add(name, type, type === 'number' ? unit : '')
          setName('')
          setUnit('')
        }}
      >
        <Glyph name="plus" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={m.fields.namePlaceholder} aria-label={m.field.name} />
        <select
          className="select"
          value={type}
          onChange={(e) => setType(e.target.value as PropertyType)}
          aria-label={m.field.type}
          style={{ width: 'auto', minHeight: 32 }}
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {m.propertyType[t]}
            </option>
          ))}
        </select>
        {type === 'number' && (
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={m.field.unit}
            aria-label={m.field.unit}
            style={{ maxWidth: 80, borderLeft: '1px solid var(--line)', paddingLeft: 10 }}
          />
        )}
        <button className="btn primary sm" type="submit" disabled={!name.trim()}>
          {m.fields.add}
        </button>
      </form>
      <div className="row">
        <span className="muted small">{m.fields.suggestions}:</span>
        <div className="chips">
          {m.fields.suggestionList
            .map((s) => s.split('|'))
            .filter(([n]) => !existing.has(n.toLowerCase()))
            .map(([n, t, u]) => (
              <button key={n} className="chip" onClick={() => add(n, t as PropertyType, u)}>
                + {n}
                {u ? ` (${u})` : ''}
              </button>
            ))}
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="empty">{m.fields.empty}</div>
      ) : (
        <div className="table-wrap">
          <table className="grid req-table fields-table">
            <colgroup>
              {/* The handle first, as in the requirements. */}
              <col style={{ width: 36 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 90 }} />
              {/* What else the type needs takes the rest. */}
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 48 }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">{m.reorder.handleColumn}</span>
                </th>
                <th scope="col">{m.field.name}</th>
                <th scope="col">{m.field.type}</th>
                <th scope="col">{m.field.unit}</th>
                <th scope="col">{m.fields.details}</th>
                <th scope="col" title={m.fields.filledHint}>
                  {m.fields.filled}
                </th>
                <th scope="col">
                  <span className="sr-only">{m.common.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody ref={drag.body}>
              {properties.map((p) => (
                <FieldRow key={p.id} prop={p} data={data} drag={drag} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Choices of a select field, written in one cell: "Oak; Beech; White". */
const splitOptions = (v: string) => [
  ...new Set(
    v
      .split(/[;\n]/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
]

function FieldRow({ prop: p, data, drag }: { prop: PropertyDef; data: ProjectData; drag: RowDrag }) {
  const { m } = useI18n()
  const confirm = useConfirm()
  const named = (what: string) => `${what}: ${p.name}`
  const filled = data.products.filter((x) => {
    const v = x.values?.[p.id]
    return v !== undefined && v !== null && v !== ''
  }).length
  return (
    <tr {...drag.row(p.id)}>
      <td className="grip-cell">
        <button type="button" className="grip" aria-label={m.reorder.handle(p.name)} title={m.reorder.hint} {...drag.handle(p.id)}>
          <Glyph name="grip" />
        </button>
      </td>
      <td>
        <CommitInput
          className="cell-input strong"
          value={p.name}
          aria-label={m.field.name}
          onCommit={(v) => v.trim() && updateProperty(p, { name: v.trim() })}
        />
      </td>
      <td>
        <select
          className="cell-select"
          value={p.type}
          aria-label={named(m.field.type)}
          onChange={(e) => updateProperty(p, { type: e.target.value as PropertyType })}
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {m.propertyType[t]}
            </option>
          ))}
        </select>
      </td>
      <td>
        {p.type === 'number' ? (
          <CommitInput
            className="cell-input"
            value={p.unit}
            placeholder="cm"
            aria-label={named(m.field.unit)}
            onCommit={(v) => updateProperty(p, { unit: v.trim() })}
          />
        ) : (
          <span className="muted small">—</span>
        )}
      </td>
      <td>
        {p.type === 'number' ? (
          <select
            className="cell-select"
            value={p.better ?? ''}
            aria-label={named(m.fields.better)}
            title={m.fields.betterHint}
            onChange={(e) => updateProperty(p, { better: e.target.value as '' | 'lower' | 'higher' })}
          >
            <option value="">{m.fields.betterNone}</option>
            <option value="lower">{m.fields.betterLower}</option>
            <option value="higher">{m.fields.betterHigher}</option>
          </select>
        ) : p.type === 'select' ? (
          <CommitInput
            className="cell-input"
            value={p.options.join('; ')}
            placeholder={m.fields.optionsPlaceholder}
            aria-label={named(m.field.options)}
            onCommit={(v) => updateProperty(p, { options: splitOptions(v) })}
          />
        ) : (
          <span className="muted small">{m.fields.typeHint[p.type]}</span>
        )}
      </td>
      <td className="num-cell">
        <span className={filled ? undefined : 'muted'}>
          {filled}/{data.products.length}
        </span>
      </td>
      <td>
        <span className="row-actions">
          <button
            className="icon-btn sm"
            aria-label={named(m.common.delete)}
            title={m.common.delete}
            onClick={async () => {
              if (await confirm({ title: m.fields.deleteTitle(p.name), text: m.fields.deleteText, confirmLabel: m.common.delete, danger: true }))
                await deleteProperty(p)
            }}
          >
            <Glyph name="trash" />
          </button>
        </span>
      </td>
    </tr>
  )
}
