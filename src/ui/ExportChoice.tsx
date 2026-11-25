import { useState } from 'react'
import { EXPORT_FORMATS, type ExportFormat } from '../hooks'
import { useI18n } from '../i18n'
import { Glyph } from './Glyph'

/**
 * One "Export" entry in a menu. It opens the formats in place as one short row (.xlsx .ods .csv
 * .json), so the menu stays short. Each is named by its extension; its tooltip, which screen
 * readers announce as its description, says what it holds.
 */
export function ExportChoice({ close, run }: { close: () => void; run: (format: ExportFormat) => void }) {
  const { m } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Glyph name="download" /> {m.common.export}
        <Glyph name={open ? 'up' : 'down'} />
      </button>
      {open && (
        <div className="export-formats" role="group" aria-label={m.common.export}>
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              title={m.common.formats[f]}
              onClick={() => {
                close()
                run(f)
              }}
            >
              .{f}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
