import { useRef, useState } from 'react'
import { db } from '../../db/db'
import { addProduct, updateProduct, updateProject } from '../../db/repo'
import { hostOf, looksLikeUrl, normalizeUrl } from '../../domain/values'
import { useI18n } from '../../i18n'
import { loadProductImage } from '../../images'
import { Glyph } from '../../ui/Glyph'
import { Menu } from '../../ui/Menu'
import type { ProjectData } from './useProjectData'

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
  const knownBrands = [...new Set(products.map((p) => p.brand.trim()).filter(Boolean))]

  const submit = async () => {
    const value = text.trim()
    if (!value) return
    if (looksLikeUrl(value)) {
      const url = normalizeUrl(value)
      const created = await addProduct(project.id, { url, retailer: hostOf(url) })
      // The picture comes in the background; failures show in the product details. A new
      // product takes the shop's price as long as nobody has entered one in the meantime.
      void loadProductImage(created)
        .then(async (facts) => {
          const now = await db.products.get(created.id)
          if (now && now.price === null && facts.price !== undefined) await updateProduct(now, { price: facts.price })
        })
        .catch(() => {})
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
