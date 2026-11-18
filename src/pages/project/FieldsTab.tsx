import { useState } from 'react'
import { addProperty, deleteProperty, reorder, updateProperty } from '../../db/repo'
import { PROPERTY_TYPES, type PropertyDef, type PropertyType } from '../../db/types'
import { useI18n } from '../../i18n'
import { useConfirm } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { CommitInput, CommitTextarea } from '../../ui/inputs'
import type { ProjectData } from './useProjectData'

export function FieldsTab({ data }: { data: ProjectData }) {
  const { m } = useI18n()
  const confirm = useConfirm()
  const { project, properties } = data
  const [name, setName] = useState('')
  const [type, setType] = useState<PropertyType>('text')
  const [unit, setUnit] = useState('')
  const existing = new Set(properties.map((p) => p.name.toLowerCase()))

  const add = (n: string, t: PropertyType, u: string) => addProperty(project.id, { name: n.trim(), type: t, unit: u.trim() })
  const move = (p: PropertyDef, delta: number) => {
    const list = [...properties]
    const i = list.findIndex((x) => x.id === p.id)
    const j = i + delta
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    void reorder('properties', list)
  }

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
        <div>
          {properties.map((p) => (
            <div className="field-row" key={p.id}>
              <CommitInput className="input" value={p.name} aria-label={m.field.name} onCommit={(v) => v.trim() && updateProperty(p, { name: v.trim() })} />
              <select className="select" value={p.type} aria-label={m.field.type} onChange={(e) => updateProperty(p, { type: e.target.value as PropertyType })}>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {m.propertyType[t]}
                  </option>
                ))}
              </select>
              <CommitInput
                className="input"
                value={p.unit}
                placeholder={m.field.unit}
                aria-label={m.field.unit}
                onCommit={(v) => updateProperty(p, { unit: v.trim() })}
              />
              <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
                <button className="icon-btn" onClick={() => move(p, -1)} aria-label={m.common.moveUp} title={m.common.moveUp}>
                  <Glyph name="up" />
                </button>
                <button className="icon-btn" onClick={() => move(p, 1)} aria-label={m.common.moveDown} title={m.common.moveDown}>
                  <Glyph name="down" />
                </button>
                <button
                  className="icon-btn"
                  aria-label={m.common.delete}
                  title={m.common.delete}
                  onClick={async () => {
                    if (await confirm({ title: m.fields.deleteTitle(p.name), text: m.fields.deleteText, confirmLabel: m.common.delete, danger: true }))
                      await deleteProperty(p)
                  }}
                >
                  <Glyph name="trash" />
                </button>
              </div>
              {p.type === 'number' && (
                <div className="opts row">
                  <select
                    className="select better-select"
                    value={p.better ?? ''}
                    aria-label={m.fields.better}
                    onChange={(e) => updateProperty(p, { better: e.target.value as '' | 'lower' | 'higher' })}
                  >
                    <option value="">{m.fields.betterNone}</option>
                    <option value="lower">{m.fields.betterLower}</option>
                    <option value="higher">{m.fields.betterHigher}</option>
                  </select>
                  <span className="muted small">{m.fields.betterHint}</span>
                </div>
              )}
              {p.type === 'select' && (
                <label className="field opts">
                  <span>{m.field.options}</span>
                  <CommitTextarea
                    className="textarea"
                    value={p.options.join('\n')}
                    placeholder={m.fields.optionsPlaceholder}
                    onCommit={(v) =>
                      updateProperty(p, {
                        options: [
                          ...new Set(
                            v
                              .split('\n')
                              .map((x) => x.trim())
                              .filter(Boolean),
                          ),
                        ],
                      })
                    }
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
