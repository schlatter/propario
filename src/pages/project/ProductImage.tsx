import { useEffect, useRef, useState, type ReactNode } from 'react'
import { updateProduct } from '../../db/repo'
import type { Product } from '../../db/types'
import { hostOf, safeHref } from '../../domain/values'
import { useI18n } from '../../i18n'
import {
  addPicture,
  fetchRemoteImage,
  ImageError,
  imageFromTransfer,
  isPicture,
  loadProductImage,
  makeMainPicture,
  productImage,
  removePicture,
  type ImageErrorCode,
} from '../../images'
import { MAX_PICTURES } from '../../shared/records.ts'
import type { ProductFacts } from '../../shared/product-facts.ts'
import { Glyph } from '../../ui/Glyph'
import { Preview } from '../../ui/Thumb'
import { filledLabels } from '../../domain/display'
import { Gallery } from './Gallery'
import { Menu } from '../../ui/Menu'
import { viewOf } from '../../domain/pictures'
import { PictureViewDialog } from './PictureViewDialog'

/**
 * Pictures in the product drawer: a strip as wide as the drawer that a finger swipes through
 * (a swipe here changes the picture, never the product), dots below, a tap opens the gallery.
 * One menu loads, adds or removes pictures. Ctrl+V anywhere in the details (outside a text field)
 * or dropping on the strip adds a picture; a new picture never replaces one (src/images.ts).
 */
export function ProductImage({ product: p, name, actions }: { product: Product; name: string; actions?: ReactNode }) {
  const { m, fmt } = useI18n()
  const file = useRef<HTMLInputElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ImageErrorCode | null>(null)
  const [over, setOver] = useState(false)
  // Large view beside the drawer: on hover or keyboard focus (a tap opens the gallery instead).
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

  /** How many picture jobs run; several may, they are queued in src/images.ts. */
  const jobs = useRef(0)
  const run = async (job: () => Promise<{ facts: ProductFacts; filled: string[] } | void>) => {
    jobs.current++
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
      if (--jobs.current === 0) setBusy(false)
    }
  }
  /** A pasted or dropped picture is always added – the first one becomes the main picture. */
  const take = (dt: DataTransfer | null) => {
    const got = imageFromTransfer(dt)
    if (!got) return false
    void run(async () => addPicture(p, 'file' in got ? got.file : (await fetchRemoteImage(got.url)).blob))
    return true
  }
  const addFiles = (files: File[]) =>
    run(async () => {
      for (const f of files) await addPicture(p, f)
    })
  // Ctrl+V anywhere in the details adds a picture – not only with the strip focused (a click on
  // it opens the gallery). Text fields keep their own paste.
  const takeRef = useRef(take)
  takeRef.current = take
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
      if (takeRef.current(e.clipboardData)) e.preventDefault()
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])
  const further = (p.images ?? []).filter(isPicture)
  /** All pictures, the main one first. */
  const pictures = src ? [src, ...further] : []
  /** The picture in view: follows the strip's scroll position. */
  const [shownAt, setShownAt] = useState(0)
  const at = Math.min(shownAt, Math.max(0, pictures.length - 1))
  /** Set while the strip scrolls to a chosen picture: its passing positions are not choices. */
  const heading = useRef<number | null>(null)
  const show = (i: number) => {
    const t = track.current
    heading.current = t && Math.round(t.scrollLeft / t.clientWidth) !== i ? i : null
    if (t) t.scrollTo({ left: i * t.clientWidth })
    setShownAt(i)
  }
  const onTrackScroll = (t: HTMLDivElement) => {
    const i = Math.round(t.scrollLeft / t.clientWidth)
    if (heading.current !== null) {
      if (i !== heading.current) return
      heading.current = null
    }
    setShownAt(i)
  }
  const [gallery, setGallery] = useState<number | null>(null)
  /** The picture whose side and part are being set (src/pages/project/PictureViewDialog.tsx). */
  const [marking, setMarking] = useState<string | null>(null)
  /** Picture `i` becomes the main one; the former main one stays as a further picture. By path, not position: the list may have changed meanwhile. */
  const makeMain = (i: number) => {
    void makeMainPicture(p, pictures[i])
    show(0)
  }
  const remove = (i: number) => removePicture(p, pictures[i])
  const openGallery = () => {
    if (!src) return
    setZoom(false)
    setGallery(at)
  }

  return (
    <div className="pimg">
      <div
        ref={box}
        className={`pimg-stage${over ? ' over' : ''}${src ? ' zoomable' : ' empty'}`}
        tabIndex={0}
        onPointerEnter={(e) => src && e.pointerType === 'mouse' && setZoom(true)}
        // Also when the picture appears under a resting pointer (e.g. right after opening the details).
        onPointerMove={(e) => src && e.pointerType === 'mouse' && !zoom && setZoom(true)}
        onPointerLeave={() => setZoom(false)}
        // A tap opens the gallery; a swipe scrolls the strip and is no tap.
        onClick={openGallery}
        onFocus={(e) => src && e.currentTarget.matches(':focus-visible') && setZoom(true)}
        onBlur={() => setZoom(false)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Escape' && zoom) {
            // Close the large view, not the drawer.
            e.preventDefault()
            e.stopPropagation()
            setZoom(false)
          } else if ((e.key === 'Enter' || e.key === ' ') && src) {
            e.preventDefault()
            openGallery()
          } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && pictures.length > 1) {
            e.preventDefault()
            show(Math.min(pictures.length - 1, Math.max(0, at + (e.key === 'ArrowLeft' ? -1 : 1))))
          }
        }}
        role="group"
        aria-roledescription={pictures.length > 1 ? 'carousel' : undefined}
        aria-label={src ? m.image.openGallery(pictures.length) : m.image.dropLabel}
        aria-busy={busy}
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
        {src ? (
          <div ref={track} className="pimg-track" onScroll={(e) => onTrackScroll(e.currentTarget)}>
            {pictures.map((pic, i) => (
              <div className="pimg-slide" key={pic} aria-hidden={i !== at}>
                <img src={pic} alt={i === 0 ? name : m.gallery.alt(name, i + 1, pictures.length)} referrerPolicy="no-referrer" draggable={false} />
                {viewOf(p.views, pic) && <span className="pimg-view">{m.pictureView.views[viewOf(p.views, pic)!]}</span>}
              </div>
            ))}
          </div>
        ) : (
          <span className="pimg-hint">{m.image.dropHint}</span>
        )}
        {/* With a mouse: quiet arrows at the edges; a finger swipes, the keyboard uses ← →. */}
        {pictures.length > 1 && (
          <>
            <button
              type="button"
              className="pimg-nav prev"
              tabIndex={-1}
              hidden={at === 0}
              aria-label={m.gallery.prev}
              title={m.gallery.prev}
              onClick={(e) => {
                e.stopPropagation()
                show(at - 1)
              }}
            >
              <span>
                <Glyph name="chevronLeft" />
              </span>
            </button>
            <button
              type="button"
              className="pimg-nav next"
              tabIndex={-1}
              hidden={at === pictures.length - 1}
              aria-label={m.gallery.next}
              title={m.gallery.next}
              onClick={(e) => {
                e.stopPropagation()
                show(at + 1)
              }}
            >
              <span>
                <Glyph name="chevronRight" />
              </span>
            </button>
          </>
        )}
        {busy && <span className="pimg-busy">{m.image.working}</span>}
      </div>
      {zoom && src && box.current && <Preview anchor={box.current} src={pictures[at]} alt={name} size={zoomSize()} />}
      <div className="pimg-bar">
        {pictures.length > 1 && (
          <div className="pimg-dots" role="group" aria-label={m.gallery.all}>
            {pictures.map((pic, i) => (
              <button key={pic} type="button" aria-label={m.image.view(i + 1)} aria-current={i === at} onClick={() => show(i)}>
                <span />
              </button>
            ))}
          </div>
        )}
        <span className="spacer" />
        {actions}
        <Menu
          label={m.image.menuLabel}
          className="btn sm"
          trigger={
            <>
              <Glyph name="image" /> {m.image.menu}
            </>
          }
        >
          {(close) => {
            const act = (job: () => void) => () => {
              close()
              job()
            }
            return (
              <>
                {link && (
                  <button type="button" disabled={busy} onClick={act(() => void run(() => loadProductImage(p, link)))}>
                    <Glyph name="download" /> {stored ? m.image.reload : m.image.fromLink}
                  </button>
                )}
                {/* Choosing never replaces: without a picture it becomes the main one, otherwise it is added. */}
                {(!stored || further.length < MAX_PICTURES) && (
                  <button type="button" title={m.image.addFurtherHint} onClick={act(() => file.current?.click())}>
                    <Glyph name={stored ? 'plus' : 'upload'} /> {stored ? m.image.addFurther : m.image.chooseFile}
                  </button>
                )}
                {stored && (
                  <button type="button" onClick={act(() => setMarking(pictures[at]))}>
                    <Glyph name="crop" /> {m.pictureView.open}
                  </button>
                )}
                {stored && at > 0 && (
                  <button type="button" onClick={act(() => makeMain(at))}>
                    <Glyph name="star" /> {m.gallery.makeMain}
                  </button>
                )}
                {stored && (
                  <button type="button" className="danger" onClick={act(() => void remove(at))}>
                    <Glyph name="trash" /> {pictures.length > 1 ? m.image.removeFurther(at) : m.image.remove}
                  </button>
                )}
                <p className="menu-note">{m.image.pasteHint}</p>
              </>
            )
          }}
        </Menu>
        {link && (
          // The shop page, at hand: it is where the product is bought and checked.
          <a className="btn sm primary product-link" href={link} target="_blank" rel="noopener noreferrer">
            <Glyph name="out" /> {hostOf(p.url) || m.common.openLink}
          </a>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-pick="add"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void addFiles(files)
          }}
        />
      </div>
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
      {marking && <PictureViewDialog product={p} src={marking} onClose={() => setMarking(null)} />}
      <Gallery pictures={pictures} name={name} start={gallery ?? 0} open={gallery !== null} onClose={() => setGallery(null)} onMakeMain={makeMain} />
    </div>
  )
}
