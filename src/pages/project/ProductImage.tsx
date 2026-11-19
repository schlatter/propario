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
  isPicture,
  loadProductImage,
  productImage,
  setProductImageFromBlob,
  type ImageErrorCode,
} from '../../images'
import { MAX_PICTURES } from '../../shared/records.ts'
import type { ProductFacts } from '../../shared/product-facts.ts'
import { Glyph } from '../../ui/Glyph'
import { Preview, Thumb } from '../../ui/Thumb'
import { filledLabels } from '../../domain/display'
import { Gallery } from './Gallery'

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
  const further = (p.images ?? []).filter(isPicture)
  const moreFiles = useRef<HTMLInputElement>(null)
  /** All pictures, the main one first. */
  const pictures = src ? [src, ...further] : []
  const [gallery, setGallery] = useState<number | null>(null)
  /** Picture `i` becomes the main one and moves to the front; the others keep their order. */
  const makeMain = (i: number) => {
    const rest = pictures.filter((_, j) => j !== i)
    void updateProduct(p, { image: pictures[i], images: rest })
  }
  /** Removing the main picture lets the next one take its place. */
  const removeMain = () => updateProduct(p, { image: further[0] ?? '', images: further.slice(1) })

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
        // A click or tap opens the gallery – on a phone that is how a picture gets large.
        onClick={() => {
          if (!src) return
          setZoom(false)
          setGallery(0)
        }}
        onFocus={(e) => src && e.currentTarget.matches(':focus-visible') && setZoom(true)}
        onBlur={() => setZoom(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && zoom) {
            // Close the large view, not the drawer.
            e.preventDefault()
            e.stopPropagation()
            setZoom(false)
          } else if ((e.key === 'Enter' || e.key === ' ') && src && e.target === e.currentTarget) {
            e.preventDefault()
            setZoom(false)
            setGallery(0)
          }
        }}
        role="group"
        aria-label={src ? m.image.openGallery(pictures.length) : m.image.dropLabel}
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
            <button type="button" className="btn sm ghost" disabled={busy} onClick={removeMain}>
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
            {pictures.map((pic, i) => (
              <span className={`pimg-thumb${i === 0 ? ' is-main' : ''}`} key={pic}>
                <Thumb
                  src={pic}
                  alt={m.image.furtherAlt(name, i)}
                  label={m.image.view(i + 1, i === 0)}
                  onClick={() => setGallery(i)}
                  previewSize={zoomSize()}
                />
                {i === 0 ? (
                  <span className="pimg-star" title={m.gallery.isMain} aria-hidden="true">
                    <Glyph name="star" />
                  </span>
                ) : (
                  <button
                    type="button"
                    className="icon-btn sm"
                    aria-label={m.image.removeFurther(i)}
                    title={m.image.removeFurther(i)}
                    onClick={() => updateProduct(p, { images: further.filter((_, j) => j !== i - 1) })}
                  >
                    <Glyph name="close" />
                  </button>
                )}
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
      <Gallery pictures={pictures} name={name} start={gallery ?? 0} open={gallery !== null} onClose={() => setGallery(null)} onMakeMain={makeMain} />
    </div>
  )
}
