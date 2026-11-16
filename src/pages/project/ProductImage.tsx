import { useRef, useState } from 'react'
import { updateProduct } from '../../db/repo'
import type { Product } from '../../db/types'
import { safeHref } from '../../domain/values'
import { useI18n } from '../../i18n'
import { ImageError, imageFromTransfer, loadProductImage, productImage, setProductImageFromBlob, type ImageErrorCode } from '../../images'
import { Glyph } from '../../ui/Glyph'

/** Image block in the product drawer: load from link, pick a file, paste or drop, remove. */
export function ProductImage({ product: p, name }: { product: Product; name: string }) {
  const { m } = useI18n()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ImageErrorCode | null>(null)
  const [over, setOver] = useState(false)
  const src = productImage(p)
  const stored = !!p.image
  const link = safeHref(p.url)

  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await job()
    } catch (e) {
      setError(e instanceof ImageError ? e.code : 'failed')
    } finally {
      setBusy(false)
    }
  }
  const take = (dt: DataTransfer | null) => {
    const got = imageFromTransfer(dt)
    if (!got) return false
    void run(() => ('file' in got ? setProductImageFromBlob(p, got.file) : loadProductImage(p, got.url)))
    return true
  }

  return (
    <div className="pimg">
      <div
        className={`pimg-drop${over ? ' over' : ''}${src ? '' : ' empty'}`}
        tabIndex={0}
        role="group"
        aria-label={m.image.dropLabel}
        aria-busy={busy}
        onPaste={(e) => {
          if (take(e.clipboardData)) e.preventDefault()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          take(e.dataTransfer)
        }}
      >
        {src ? <img src={src} alt={name} referrerPolicy="no-referrer" /> : <span className="pimg-hint">{m.image.dropHint}</span>}
        {busy && <span className="pimg-busy">{m.image.working}</span>}
      </div>
      <div className="pimg-side">
        <div className="pimg-actions">
          {link && (
            <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => loadProductImage(p, safeHref(p.imageUrl) ?? link))}>
              <Glyph name="download" /> {stored ? m.image.reload : m.image.fromLink}
            </button>
          )}
          <button type="button" className="btn sm" disabled={busy} onClick={() => file.current?.click()}>
            <Glyph name="upload" /> {m.image.chooseFile}
          </button>
          {stored && (
            <button type="button" className="btn sm ghost" disabled={busy} onClick={() => updateProduct(p, { image: '' })}>
              <Glyph name="trash" /> {m.image.remove}
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void run(() => setProductImageFromBlob(p, f))
            }}
          />
        </div>
        <p className="muted small">{m.image.pasteHint}</p>
        {error && (
          <p className="small pimg-error" role="alert">
            {m.image.error[error]}
          </p>
        )}
      </div>
    </div>
  )
}
