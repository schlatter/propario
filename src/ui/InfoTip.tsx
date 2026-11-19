/**
 * A quiet ⓘ that shows a short explanation on hover or keyboard focus. Next to a heading it is
 * a button of its own (named by its text); inside a field's label it is not focusable, and the
 * field's control is described by the text instead (src/ui/inputs.tsx).
 */
import { Glyph } from './Glyph'

export function InfoTip({ text, id, inLabel = false }: { text: string; id?: string; inLabel?: boolean }) {
  if (inLabel)
    return (
      <span className="info-tip" aria-hidden="true">
        <Glyph name="info" />
        <span className="tip-text" id={id}>
          {text}
        </span>
      </span>
    )
  return (
    <button type="button" className="info-tip" aria-label={text}>
      <Glyph name="info" />
      <span className="tip-text" aria-hidden="true">
        {text}
      </span>
    </button>
  )
}
