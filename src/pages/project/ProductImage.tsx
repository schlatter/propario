import { useRef, useState } from 'react'
import { updateProduct } from '../../db/repo'
import type { Product } from '../../db/types'
import { safeHref } from '../../domain/values'
import { useI18n } from '../../i18n'
import {
  addImageFromBlob,
  fetchRemoteImage,
  ImageError,
  imageFromTransfer,
  loadProductImage,
  productImage,
  setProductImageFromBlob,
  type ImageErrorCode,
} from '../../images'
import { IMAGE_PATH, MAX_PICTURES } from '../../shared/records.ts'
import type { ProductFacts } from '../../shared/product-facts.ts'
import { Glyph } from '../../ui/Glyph'
import { Preview, Thumb } from '../../ui/Thumb'
import { filledLabels } from '../../domain/display'

/** Image block in the product drawer: load from link, pick a file, paste or drop, remove. */
export function ProductImage({ product: p, name }: { product: Product; name: string }) {
  const { m, fmt } = useI18n()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ImageErrorCode | null>(null)
  const [over, setOver] = useState(false)
  // Large view: on hover or keyboard focus, and by tapping on touch screens.
  const box = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(false)
  /** As large as the stored copy (640 px) allows and the screen has room for beside the drawer. */
  const zoomSize = () => {
    const beside = window.innerWidth >= 900 ? window.innerWidth - 700 : window.innerWidth - 40
    return Math.max(220, Math.min(600, beside, window.innerHeight - 100))
  }
  /** The price the shop page states, offered when it differs from the product's price. */
  const [pagePrice, setPagePrice] = useState<number | null>(null)
  /** What the last page read filled in, to say so. */
  const [filled, setFilled] = useState<string[] | null>(null)
  const src = productImage(p)
  const stored = !!p.image
  const link = safeHref(p.url)

  const run = async (job: () => Promise<{ facts: ProductFacts; filled: string[] } | void>) => {
    setBusy(true)
    setError(null)
    setPagePrice(null)
    setFilled(null)
    try {
      const got = await job()
      if (got) setFilled(got.filled)
      // An empty price was filled already; a different one is only offered.
      if (got && got.facts.price !== undefined && p.price !== null && got.facts.price !== p.price) setPagePrice(got.facts.price)
    } catch (e) {
      setError(e instanceof ImageError ? e.code : 'failed')
      if (e instanceof ImageError && e.filled) setFilled(e.filled)
    } finally {
      setBusy(false)
    }
  }
  // With a main picture in place, a pasted or dropped one is added, not swapped in.
  const take = (dt: DataTransfer | null) => {
    const got = imageFromTransfer(dt)
    if (!got) return false
    if (stored) void run(async () => addImageFromBlob(p, 'file' in got ? got.file : (await fetchRemoteImage(got.url)).blob))
    else void run(() => ('file' in got ? setProductImageFromBlob(p, got.file) : loadProductImage(p, got.url)))
    return true
  }
  const further = (p.images ?? []).filter((x) => IMAGE_PATH.test(x))
  const moreFiles = useRef<HTMLInputElement>(null)
  /** A further picture becomes the main one; the main one takes its place among the others. */
  const makeMain = (i: number) => {
    const rest = [...further]
    const [chosen] = rest.splice(i, 1, ...(p.image ? [p.image] : []))
    void updateProduct(p, { image: chosen, images: rest })
  }

  return (
    <div className="pimg">
      <div
        ref={box}
        className={`pimg-drop${over ? ' over' : ''}${src ? ' zoomable' : ' empty'}`}
        tabIndex={0}
        onPointerEnter={(e) => src && e.pointerType === 'mouse' && setZoom(true)}
        // Also when the picture appears under a resting pointer (e.g. right after opening the details).
        onPointerMove={(e) => src && e.pointerType === 'mouse' && !zoom && setZoom(true)}
        onPointerLeave={() => setZoom(false)}
        onPointerUp={(e) => src && e.pointerType !== 'mouse' && setZoom((z) => !z)}
        onFocus={(e) => src && e.currentTarget.matches(':focus-visible') && setZoom(true)}
        onBlur={() => setZoom(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && zoom) {
            // Close the large view, not the drawer.
            e.preventDefault()
            e.stopPropagation()
            setZoom(false)
          }
        }}
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
      {zoom && src && box.current && <Preview anchor={box.current} src={src} alt={name} size={zoomSize()} />}
      <div className="pimg-side">
        <div className="pimg-actions">
          {link && (
            <button type="button" className="btn sm" disabled={busy} onClick={() => run(() => loadProductImage(p, link))}>
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
        {stored && (
          <div className="pimg-more" role="group" aria-label={m.image.further}>
            {further.map((src, i) => (
              <span className="pimg-thumb" key={src}>
                <Thumb src={src} alt={m.image.furtherAlt(name, i + 1)} label={m.image.makeMain(i + 1)} onClick={() => makeMain(i)} previewSize={zoomSize()} />
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label={m.image.removeFurther(i + 1)}
                  title={m.image.removeFurther(i + 1)}
                  onClick={() => updateProduct(p, { images: further.filter((_, j) => j !== i) })}
                >
                  <Glyph name="close" />
                </button>
              </span>
            ))}
            {further.length < MAX_PICTURES && (
              <button type="button" className="btn sm" disabled={busy} onClick={() => moreFiles.current?.click()} title={m.image.addFurtherHint}>
                <Glyph name="plus" /> {m.image.addFurther}
              </button>
            )}
            <input
              ref={moreFiles}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])]
                e.target.value = ''
                void run(async () => {
                  for (const f of files) await addImageFromBlob(p, f)
                })
              }}
            />
          </div>
        )}
        <p className="muted small">{m.image.pasteHint}</p>
        {filled && (
          <p className="small" role="status">
            {filled.length ? m.pageImport.filled(filledLabels(filled, m)) : m.pageImport.nothing}
          </p>
        )}
        {pagePrice !== null && (
          <p className="small row" role="status">
            {m.image.pagePrice(fmt.money(pagePrice))}
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                await updateProduct(p, { price: pagePrice })
                setPagePrice(null)
              }}
            >
              {m.image.takePrice}
            </button>
          </p>
        )}
        {error && (
          <p className="small pimg-error" role="alert">
            {m.image.error[error]}
          </p>
        )}
      </div>
    </div>
  )
}
