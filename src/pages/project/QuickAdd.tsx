import { useRef, useState } from 'react'
import { addProduct, updateProject } from '../../db/repo'
import { filledLabels, productName } from '../../domain/display'
import { sameLink } from '../../domain/links'
import { hostOf, looksLikeUrl, normalizeUrl } from '../../domain/values'
import { useI18n } from '../../i18n'
import { ImageError, loadProductImage } from '../../images'
import { useToast } from '../../ui/Dialog'
import { Glyph } from '../../ui/Glyph'
import { Menu } from '../../ui/Menu'
import type { ProjectData } from './useProjectData'
import { usePageUpdate } from './usePageUpdate'

/**
 * Adding a product: type a name ("Brand Model" is split when the brand is known) or paste a
 * link (opens the new product and fetches its picture). As a button in the tab row, or inline
 * while the comparison has no products yet.
 */
export function QuickAdd({ data, onOpen, inline = false }: { data: ProjectData; onOpen: (id: string) => void; inline?: boolean }) {
  const { m } = useI18n()
  if (inline) return <QuickAddForm data={data} onOpen={onOpen} />
  return (
    <Menu
      label={m.project.addProduct}
      className="btn sm primary"
      listClassName="quick-add-pop"
      trigger={
        <>
          <Glyph name="plus" /> {m.project.addShort}
        </>
      }
    >
      {(close) => (
        <QuickAddForm
          data={data}
          autoFocus
          onOpen={(id) => {
            close()
            onOpen(id)
          }}
        />
      )}
    </Menu>
  )
}

function QuickAddForm({ data, onOpen, autoFocus }: { data: ProjectData; onOpen: (id: string) => void; autoFocus?: boolean }) {
  const { m } = useI18n()
  const { project, products } = data
  const [text, setText] = useState('')
  const [added, setAdded] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const pageUpdate = usePageUpdate(data.properties)
  const knownBrands = [...new Set(products.map((p) => p.brand.trim()).filter(Boolean))]

  const submit = async () => {
    const value = text.trim()
    if (!value) return
    if (looksLikeUrl(value)) {
      const url = normalizeUrl(value)
      // The same page again: no second entry – offer what the page adds to the existing one.
      const existing = products.find((x) => sameLink(x.url, url))
      if (existing) {
        setText('')
        onOpen(existing.id)
        const name = productName(existing, hostOf(url))
        void pageUpdate(existing, { title: m.pageUpdate.duplicateTitle(name), text: m.pageUpdate.duplicateText })
        return
      }
      const created = await addProduct(project.id, { url, retailer: hostOf(url) })
      // Picture and page data come in the background and fill only empty fields; image
      // failures show in the product details.
      const tell = (filled: string[] | undefined) => filled?.length && toast(m.pageImport.filled(filledLabels(filled, m)))
      void loadProductImage(created)
        .then((r) => tell(r.filled))
        // Never silent: say why nothing came, and what the address gave instead.
        .catch((e) => {
          const filled = e instanceof ImageError && e.filled?.length ? ` ${m.pageImport.fromAddress(filledLabels(e.filled, m))}` : ''
          const why = e instanceof ImageError ? m.image.error[e.code] : m.image.error.failed
          toast(`${hostOf(url)}: ${why}${filled}`)
        })
      setText('')
      onOpen(created.id)
    } else {
      const brand = knownBrands.find((b) => value.toLowerCase().startsWith(`${b.toLowerCase()} `))
      await addProduct(project.id, brand ? { brand, model: value.slice(brand.length).trim() } : { model: value })
      setText('')
      setAdded(value)
      ref.current?.focus()
    }
    if (project.status === 'research' && products.length >= 1) void updateProject(project.id, { status: 'comparing' })
  }

  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Glyph name="plus" />
      <input
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        placeholder={m.project.addPlaceholder}
        aria-label={m.project.addPlaceholder}
      />
      <button className="btn primary sm" type="submit" disabled={!text.trim()}>
        {m.common.add}
      </button>
      {added && (
        <span className="sr-only" role="status">
          {m.project.added(added)}
        </span>
      )}
    </form>
  )
}
