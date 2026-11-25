import { useState } from 'react'
import { useI18n } from '../i18n'
import { Glyph, type GlyphName } from './Glyph'

/** One "Export" entry in a menu; it opens the formats in place, so the menu stays short. */
export function ExportChoice({ close, choices }: { close: () => void; choices: { glyph: GlyphName; label: string; run: () => void }[] }) {
  const { m } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Glyph name="download" /> {m.common.export}
        <Glyph name={open ? 'up' : 'down'} />
      </button>
      {open &&
        choices.map((c) => (
          <button
            key={c.label}
            type="button"
            className="sub"
            onClick={() => {
              close()
              c.run()
            }}
          >
            <Glyph name={c.glyph} /> {c.label}
          </button>
        ))}
    </>
  )
}
