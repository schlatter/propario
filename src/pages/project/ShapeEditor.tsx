import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { updateProduct } from '../../db/repo'
import { MAX_PARTS, type Product, type ShapePart } from '../../db/types'
import { addPart, formFromProfiles, moveCut, profileSteps, removePart, splitAt } from '../../domain/form'
import type { Size } from '../../domain/size'
import { useI18n } from '../../i18n'
import { readRows } from './useMeasured'
import { InfoTip } from '../../ui/InfoTip'
import { Glyph } from '../../ui/Glyph'

type Note = 'read' | 'nothing' | null

/**
 * The form of one product inside its size: where it is cut, and how wide and deep each part is.
 * The size fields stay the measure – the top part takes what is left. With a dimension drawing
 * set for 3D (or a picture of the side), the form is read from it (src/domain/form.ts), so mostly nothing has to
 * be typed; the front view adds the widths.
 */
export function ShapeEditor({
  product,
  size,
  draft,
  setDraft,
  photoFront,
}: {
  product: Product
  size: Size
  draft: ShapePart[]
  setDraft: Dispatch<SetStateAction<ShapePart[]>>
  /** The way to the photo on the front, beside "Edit 3D model". */
  photoFront?: ReactNode
}) {
  const { m, fmt } = useI18n()
  const [note, setNote] = useState<Note>(null)
  const full = size.width && size.height && size.depth ? (size as Required<Size>) : null
  // The drawing's views first, else pictures marked as the side and the front.
  const d = product.drawing
  const side = d?.side ? { src: d.src, crop: d.side } : product.views?.side
  const front = d?.front ? { src: d.src, crop: d.front } : product.views?.front

  const read = async () => {
    if (!full || !side) return
    const rows = await readRows(side.src, side.crop)
    const frontRows = front ? await readRows(front.src, front.crop) : null
    const form = rows ? formFromProfiles(full, profileSteps(rows), frontRows ?? undefined) : []
    if (form.length) setDraft(form)
    setNote(form.length ? 'read' : 'nothing')
    return form.length
  }
  const [open, setOpen] = useState(false)

  if (!full) return <p className="muted small">{m.model3d.noSize}</p>
  const cm = (n: number) => fmt.number(Math.round(n * 10) / 10)
  const rounded = draft.map((p) => ({ w: Math.round(p.w * 10) / 10, h: Math.round(p.h * 10) / 10, d: Math.round(p.d * 10) / 10 }))
  const saved = JSON.stringify(product.shape ?? []) === JSON.stringify(rounded)
  const set = (i: number, patch: Partial<ShapePart>) => setDraft(draft.map((p, n) => (n === i ? { ...p, ...patch } : p)))
  const half = () => setDraft(splitAt(full, Math.round(full.height / 2)))
  // Opened without a form: read from the drawing where there is one, else a cut in the middle to start from.
  const toggle = async () => {
    if (open) {
      if (!saved) setDraft(product.shape ?? [])
      setNote(null)
      setOpen(false)
      return
    }
    setOpen(true)
    if (!draft.length && !(side && (await read()))) half()
  }

  return (
    <section className="model3d-form" aria-label={m.model3d.editModel}>
      <div className="row model3d-edit-row">
        {photoFront}
        <span className="model3d-with-tip">
          <button type="button" className="btn sm" aria-expanded={open} aria-controls="model3d-parts" onClick={() => void toggle()}>
            <Glyph name="edit" /> {m.model3d.editModel}
          </button>
          <InfoTip text={m.model3d.formHint(cm(full.width), cm(full.height), cm(full.depth))} />
        </span>
      </div>
      {open && (
        <div id="model3d-parts" className="model3d-panel">
          {note && (
            <p className="small" role="status">
              {note === 'read' ? m.model3d.readDone : m.model3d.readNothing}
            </p>
          )}
          <ol className="model3d-parts">
            {/* Top part first, as it stands. */}
            {draft
              .map((p, i) => ({ p, i }))
              .reverse()
              .map(({ p, i }) => {
                const top = i === draft.length - 1
                return (
                  <li key={i}>
                    <span className="model3d-part-name">{m.model3d.part(i + 1, draft.length)}</span>
                    {top ? (
                      <span className="model3d-rest">
                        <span>{m.model3d.sides.h}</span>
                        <span>{m.model3d.rest(cm(p.h))}</span>
                      </span>
                    ) : (
                      <NumberField label={m.model3d.sides.h} value={p.h} max={p.h + draft[i + 1].h - 1} onCommit={(h) => setDraft(moveCut(draft, i, h))} />
                    )}
                    <NumberField label={m.model3d.sides.w} value={p.w} max={full.width} onCommit={(w) => set(i, { w })} />
                    <NumberField label={m.model3d.sides.d} value={p.d} max={full.depth} onCommit={(d) => set(i, { d })} />
                    <button
                      type="button"
                      className="icon-btn sm"
                      aria-label={m.model3d.removePart(i + 1)}
                      title={m.model3d.removePart(i + 1)}
                      onClick={() => setDraft(removePart(draft, i))}
                    >
                      <Glyph name="close" />
                    </button>
                  </li>
                )
              })}
          </ol>
          <div className="row model3d-form-actions">
            {side && (
              <button type="button" className="btn sm" onClick={() => void read()}>
                {m.model3d.read}
              </button>
            )}
            {draft.length < MAX_PARTS && (
              <button type="button" className="btn sm" onClick={() => (draft.length ? setDraft(addPart(draft)) : half())}>
                <Glyph name="plus" /> {m.model3d.addPart}
              </button>
            )}
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                // Back to one piece, as large as the product – saved at once.
                setDraft([])
                void updateProduct(product, { shape: [] })
                setNote(null)
                setOpen(false)
              }}
            >
              {m.model3d.formReset}
            </button>
            <span className="spacer" />
            <button type="button" className="btn primary sm" onClick={() => void updateProduct(product, { shape: rounded })} disabled={saved}>
              {m.common.save}
            </button>
          </div>
          {!side && <p className="muted small">{m.model3d.readTip}</p>}
        </div>
      )}
    </section>
  )
}

/** A number in cm, taken over as soon as it is one between 1 and `max`; while typing anything may stand there. */
function NumberField({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (n: number) => void }) {
  const shown = String(Math.round(value * 10) / 10)
  const [text, setText] = useState(shown)
  // A change from outside (a moved cut, a drawing read) shows at once.
  useEffect(() => setText((t) => (Number(t.replace(',', '.')) === Math.round(value * 10) / 10 ? t : shown)), [shown, value])
  const n = Number(text.replace(',', '.'))
  const ok = text.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= max + 0.001
  return (
    <label>
      <span>{label}</span>
      <input
        className="input"
        type="text"
        inputMode="decimal"
        value={text}
        aria-invalid={!ok}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value.replace(',', '.'))
          if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= 1 && v <= max + 0.001) onCommit(v)
        }}
        onBlur={() => setText(shown)}
      />
    </label>
  )
}
